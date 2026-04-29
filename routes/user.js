/**
 * 用户相关路由
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const axios = require('axios');
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');

// 微信小程序配置
const WECHAT_APPID = process.env.WECHAT_APPID || 'wx06d5fcc693a93334';
const WECHAT_SECRET = process.env.WECHAT_SECRET || '17221692cc45af67704af9f3d9dc09f0';

// POST /user/login - 用户名密码登录
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return R.error(res, '用户名和密码不能为空');
    }

    const user = db.findUserByUsername(username.trim());
    if (!user) {
      return R.error(res, '用户名或密码错误');
    }

    // 兼容 PHP 的 $2y$ bcrypt 哈希
    const hash = user.password.replace(/^\$2y\$/, '$2a$');
    if (!bcrypt.compareSync(password, hash)) {
      return R.error(res, '用户名或密码错误');
    }

    delete user.password;
    const token = auth.generateToken(user.id);
    R.success(res, { token, user }, '登录成功');
  } catch (e) {
    R.serverError(res, '登录失败：' + e.message);
  }
});

// POST /user/register - 注册
router.post('/register', (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    if (!username || !password) {
      return R.error(res, '用户名和密码不能为空');
    }
    if (username.length < 3 || username.length > 20) {
      return R.error(res, '用户名长度应在3-20个字符之间');
    }
    if (password.length < 6) {
      return R.error(res, '密码长度不能少于6个字符');
    }

    if (db.findUserByUsername(username.trim())) {
      return R.error(res, '用户名已被使用');
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const userId = db.addUser({
      username: username.trim(),
      password: passwordHash,
      nickname: nickname || username,
      avatar: ''
    });

    if (!userId) {
      return R.serverError(res, '注册失败');
    }

    const user = db.findUserById(userId);
    delete user.password;
    const token = auth.generateToken(userId);
    R.success(res, { token, user }, '注册成功');
  } catch (e) {
    R.serverError(res, '注册失败：' + e.message);
  }
});

// POST /user/wx_login_demo - 演示登录（开发环境）
router.post('/wx_login_demo', (req, res) => {
  try {
    let user = db.findUserByUsername('demo_user');
    if (!user) {
      const userId = db.addUser({
        username: 'demo_user',
        password: bcrypt.hashSync('demo123', 10),
        nickname: '演示用户',
        avatar: '',
        role: 'user'
      });
      user = db.findUserById(userId);
    }
    delete user.password;
    const token = auth.generateToken(user.id);
    R.success(res, { token, user }, '演示登录成功');
  } catch (e) {
    R.serverError(res, '演示登录失败：' + e.message);
  }
});

// POST /user/wx_login - 微信小程序登录
router.post('/wx_login', async (req, res) => {
  try {
    const { code, nickname, avatar } = req.body;
    if (!code) {
      return R.error(res, 'code不能为空');
    }

    // 请求微信 jscode2session
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}&js_code=${code}&grant_type=authorization_code`;
    const wxRes = await axios.get(url, { timeout: 30000 });
    const result = wxRes.data;

    if (result.errcode) {
      return R.error(res, '微信API错误: ' + (result.errmsg || '未知错误'));
    }
    if (!result.openid) {
      return R.error(res, '未获取到openid');
    }

    const openid = result.openid;

    // 查找或创建用户
    let user = db.findUserByOpenid(openid);
    if (!user) {
      const userId = db.addUser({
        openid: openid,
        username: 'user_' + openid.slice(-8),
        password: bcrypt.hashSync(Date.now().toString(), 10),
        nickname: nickname || '微信用户',
        avatar: avatar || '',
        role: 'user'
      });
      user = db.findUserById(userId);
    } else if (nickname || avatar) {
      // 更新已有用户的昵称/头像
      const updateData = {};
      if (nickname && !user.nickname) updateData.nickname = nickname;
      if (avatar && !user.avatar) updateData.avatar = avatar;
      if (Object.keys(updateData).length > 0) {
        db.updateUser(user.id, updateData);
        user = db.findUserById(user.id);
      }
    }

    delete user.password;
    const token = auth.generateToken(user.id);
    R.success(res, { token, user, openid }, '登录成功');
  } catch (e) {
    console.error('wx_login error:', e);
    R.serverError(res, '登录失败：' + e.message);
  }
});

// GET /user/info - 获取当前用户信息
router.get('/info', (req, res) => {
  try {
    const userId = auth.getCurrentUser(req)?.id;
    if (!userId) {
      return R.success(res, null, '未登录');
    }
    const user = db.findUserById(userId);
    if (!user) {
      return R.success(res, null, '未登录');
    }
    delete user.password;
    R.success(res, user, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
});

// GET /user/profile - 用户详情
router.get('/profile', (req, res) => {
  try {
    const user = auth.getCurrentUser(req);
    if (!user) {
      return R.unauthorized(res, '请先登录');
    }
    const u = db.findUserById(user.id);
    if (!u) {
      return R.unauthorized(res, '用户不存在');
    }
    delete u.password;
    R.success(res, u, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
});

// POST /user/update - 更新用户信息
router.post('/update', (req, res) => {
  try {
    const user = auth.getCurrentUser(req);
    if (!user) {
      return R.unauthorized(res);
    }
    const { nickname, avatar, phone } = req.body;
    const data = {};
    if (nickname !== undefined) data.nickname = nickname;
    if (avatar !== undefined) data.avatar = avatar;
    if (phone !== undefined) data.phone = phone;

    db.updateUser(user.id, data);
    const u = db.findUserById(user.id);
    delete u.password;
    R.success(res, u, '更新成功');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
});

// POST /user/recharge - 余额充值
router.post('/recharge', (req, res) => {
  try {
    const user = auth.getCurrentUser(req);
    if (!user) {
      return R.unauthorized(res);
    }
    const { amount } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return R.error(res, '充值金额无效');
    }
    const u = db.findUserById(user.id);
    const newBalance = parseFloat(u.balance || 0) + amt;
    db.updateUser(user.id, { balance: newBalance });
    R.success(res, { balance: newBalance }, '充值成功');
  } catch (e) {
    R.serverError(res, '充值失败：' + e.message);
  }
});

// POST /user/change_password - 修改密码
router.post('/change_password', (req, res) => {
  try {
    const user = auth.getCurrentUser(req);
    if (!user) {
      return R.unauthorized(res);
    }
    const { old_password, new_password } = req.body;
    const u = db.findUserById(user.id);
    const hash = u.password.replace(/^\$2y\$/, '$2a$');
    if (!bcrypt.compareSync(old_password, hash)) {
      return R.error(res, '原密码错误');
    }
    db.updateUser(user.id, { password: bcrypt.hashSync(new_password, 10) });
    R.success(res, null, '密码修改成功');
  } catch (e) {
    R.serverError(res, '修改失败：' + e.message);
  }
});

// POST /user/verify_token - 验证token
router.post('/verify_token', (req, res) => {
  try {
    // 优先从 header 获取，兼容 body 传参
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token = req.body.token;
    if (authHeader) {
      const match = authHeader.match(/Bearer\s+(.+)$/i);
      if (match) token = match[1];
    }
    if (!token) {
      return R.error(res, 'token不能为空');
    }
    const payload = auth.verifyToken(token);
    if (!payload) {
      return R.error(res, 'token无效或已过期');
    }
    const user = db.findUserById(payload.user_id);
    if (!user) {
      return R.error(res, '用户不存在');
    }
    delete user.password;
    R.success(res, { valid: true, user }, '验证成功');
  } catch (e) {
    R.serverError(res, '验证失败：' + e.message);
  }
});

module.exports = router;
