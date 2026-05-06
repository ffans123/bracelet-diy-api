/**
 * 地址相关路由
 */
const express = require('express');
const router = express.Router();
const db = require('../utils/jsonDB');
const auth = require('../utils/auth');
const R = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

// GET /address/list - 获取地址列表
router.get('/list', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    let addresses = await db.getAddressesByUserId(userId);
    addresses.sort((a, b) => (b.is_default || 0) - (a.is_default || 0));
    R.success(res, addresses, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /address/add - 添加地址
router.post('/add', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, province, city, district, address, detail } = req.body;
    const addressValue = address || detail;

    if (!name || !phone || !province || !city || !district || !addressValue) {
      return R.error(res, '请填写完整的收货地址信息');
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return R.error(res, '请输入正确的手机号码');
    }

    const userAddresses = await db.getAddressesByUserId(userId);
    const isDefault = userAddresses.length === 0;

    const id = await db.addAddress({
      user_id: userId,
      name: name.trim(),
      phone: phone.trim(),
      province: province.trim(),
      city: city.trim(),
      district: district.trim(),
      address: addressValue.trim(),
      is_default: isDefault ? 1 : 0
    });

    if (!id) return R.serverError(res, '添加失败');
    R.success(res, { id }, '地址添加成功');
  } catch (e) {
    R.serverError(res, '添加失败：' + e.message);
  }
}));

// POST /address/update - 更新地址
router.post('/update', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (!id) return R.error(res, 'ID不能为空');

    const addr = (await db.getAddresses()).find(a => a.id == id);
    if (!addr || addr.user_id != req.user.id) {
      return R.error(res, '地址不存在');
    }

    await db.updateAddress(id, data);
    R.success(res, null, '更新成功');
  } catch (e) {
    R.serverError(res, '更新失败：' + e.message);
  }
}));

// POST /address/delete - 删除地址
router.post('/delete', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    const addr = (await db.getAddresses()).find(a => a.id == id);
    if (!addr || addr.user_id != req.user.id) {
      return R.error(res, '地址不存在');
    }
    await db.deleteAddress(id);
    R.success(res, null, '删除成功');
  } catch (e) {
    R.serverError(res, '删除失败：' + e.message);
  }
}));

// GET /address/admin-list - 管理员获取所有地址（后台管理用）
router.get('/admin-list', auth.requireAdmin, asyncHandler(async (req, res) => {
  try {
    const addresses = await db.getAddresses();
    // 关联用户信息
    const users = db.getUsers ? await db.getUsers() : [];
    const result = addresses.map(a => {
      const user = users.find(u => u.id == a.user_id);
      return { ...a, username: user ? user.username : '-' };
    });
    R.success(res, result, '获取成功');
  } catch (e) {
    R.serverError(res, '获取失败：' + e.message);
  }
}));

// POST /address/set_default - 设置默认地址
router.post('/set_default', auth.requireAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return R.error(res, 'ID不能为空');
    const addr = (await db.getAddresses()).find(a => a.id == id);
    if (!addr || addr.user_id != req.user.id) {
      return R.error(res, '地址不存在');
    }
    await db.setDefaultAddress(req.user.id, id);
    R.success(res, null, '设置成功');
  } catch (e) {
    R.serverError(res, '设置失败：' + e.message);
  }
}));

module.exports = router;
