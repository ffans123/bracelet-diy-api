const fs = require('fs');
const bcrypt = require('bcryptjs');

const users = JSON.parse(fs.readFileSync('data/users.json', 'utf-8'));
const admin = users.find(u => u.username === 'admin');
if (admin) {
    admin.password = bcrypt.hashSync('admin888', 10);
    fs.writeFileSync('data/users.json', JSON.stringify(users, null, 2), 'utf-8');
    console.log('admin 密码已重置为: admin888');
    console.log('新 hash:', admin.password);
} else {
    console.log('未找到 admin 用户');
}
