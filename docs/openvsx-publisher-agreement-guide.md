# OpenVSX 发布者协议解决指南

## 🚨 问题描述
```
❌ You must sign a Publisher Agreement with the Eclipse Foundation before publishing any extension.
```

## 🎯 解决方案（5分钟完成）

### 1️⃣ 完善Eclipse账号（1分钟）
1. 访问：https://accounts.eclipse.org/
2. 使用您的凭据登录
3. 点击 "Edit Account"
4. 确保 "GitHub Username" 字段已正确填写
5. 保存更改

### 2️⃣ 连接OpenVSX账号（2分钟）
1. 访问：https://open-vsx.org/
2. 点击右上角用户图标登录
3. 选择 "Sign in with GitHub"
4. 授权应用访问您的GitHub账号
5. 登录成功后，点击头像进入 "Settings"
6. 找到并点击 "Log in with Eclipse"
7. 授权连接您的Eclipse账号

### 3️⃣ 签署发布者协议（2分钟）
1. 连接成功后，在Settings页面查找 "Show Publisher Agreement" 按钮
2. 点击按钮，仔细阅读协议内容
3. 滚动到协议底部
4. 点击 "Agree" 按钮同意条款
5. 看到确认消息：协议已成功签署

### 4️⃣ 重新创建namespace
```bash
# 使用环境变量保护Token
export OVSX_PAT="your_openvsx_personal_access_token"
ovsx create-namespace xkcoding -p $OVSX_PAT
```

## ✅ 验证成功
创建namespace成功后，您应该看到类似这样的消息：
```
✅ Created namespace xkcoding
```

## 🚀 下一步操作

### 配置GitHub Secret
```bash
# 在GitHub项目中添加Secret：
# 路径：Settings → Secrets and variables → Actions → New repository secret
# 名称：OVSX_PAT
# 值：[您在OpenVSX生成的Personal Access Token]
```

### 测试发布流程
```bash
# 方法1：创建GitHub Release（自动触发）
# 方法2：验证Token权限（安全测试）
export OVSX_PAT="your_token_here"
ovsx verify-pat xkcoding -p $OVSX_PAT
```

## 🔒 安全注意事项

### Token安全管理
- ❌ **绝不要**在文档、代码、公开仓库中暴露真实Token
- ✅ 仅在GitHub Secrets中配置真实Token值
- ✅ 本地测试时使用环境变量
- ✅ 定期检查和轮换Token

### 最佳实践
```bash
# ✅ 推荐：使用环境变量
export OVSX_PAT="your_actual_token_here"
ovsx create-namespace xkcoding -p $OVSX_PAT

# ❌ 避免：命令行明文传递
# ovsx create-namespace xkcoding -p actual_token_here
```

### 环境变量配置
```bash
# 方法1：临时设置（当前会话）
export OVSX_PAT="your_token"

# 方法2：永久设置（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export OVSX_PAT="your_token"' >> ~/.zshrc
source ~/.zshrc

# 方法3：使用 .env 文件（记得添加到 .gitignore）
echo "OVSX_PAT=your_token" > .env
# 然后在脚本中：source .env
```

## 📊 常见问题

### Q: 为什么需要签署协议？
A: Eclipse Foundation需要确保发布者有权发布扩展，协议保护所有参与方的合法权益。

### Q: 协议签署是一次性的吗？
A: 是的，每个账号只需签署一次，之后可以发布多个扩展。

### Q: 如果找不到 "Show Publisher Agreement" 按钮？
A: 确保：
1. Eclipse账号已正确连接
2. GitHub用户名已填写在Eclipse账号中
3. 刷新页面重试

### Q: 协议签署后多久生效？
A: 立即生效，您可以马上创建namespace和发布扩展。

### Q: "unknown option '--dry-run'" 错误
A: ovsx CLI不支持 `--dry-run` 选项。正确的测试方法：
```bash
# 验证Token权限（安全）
ovsx verify-pat xkcoding -p $OVSX_PAT

# 然后直接发布
ovsx publish extension.vsix -p $OVSX_PAT
```

### Q: Token泄露了怎么办？
A: 
1. 立即在OpenVSX删除泄露的Token
2. 生成新的Token
3. 更新GitHub Secrets
4. 检查代码仓库确保没有明文Token

## 🎊 完成确认

协议签署完成后，您的API Navigator扩展将能够：
- ✅ 在VSCode中安装（已支持）
- ✅ 在Cursor中搜索和安装
- ✅ 在Gitpod、Theia等编辑器中使用
- ✅ 自动化双平台发布

## 📝 后续维护

### Token轮换建议
- 每6个月轮换一次Token
- 在OpenVSX删除旧Token，生成新Token
- 更新GitHub Secrets中的OVSX_PAT值

### 监控发布状态
```bash
# 使用项目提供的监控脚本
./scripts/check-publication-status.sh
```

---

**创建时间**: 2025-07-28 18:00  
**版本**: v1.1 - 安全版本  
**安全等级**: ✅ 无Token泄露风险 