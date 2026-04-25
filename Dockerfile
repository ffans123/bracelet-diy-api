# 微信云托管 Express.js Dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制源码
COPY . .

# 暴露端口（云托管会自动注入 PORT 环境变量）
EXPOSE 80

# 启动
CMD ["npm", "start"]
