# 双平台扩展发布指南

本指南将帮助您将API Navigator扩展同时发布到**VSCode Marketplace**和**OpenVSX Registry**，确保在VSCode、Cursor、以及其他基于VSCode的编辑器中都能正常安装使用。

## 📋 背景说明

### 为什么需要双平台发布？

- **VSCode Marketplace**: 官方VSCode使用的扩展市场
- **OpenVSX Registry**: 开源扩展注册中心，被Cursor、Gitpod、Theia等编辑器使用

### 平台对比

| 编辑器 | 使用的扩展市场 | 发布要求 |
|--------|----------------|----------|
| VSCode | VSCode Marketplace | Microsoft Publisher账号 + PAT |
| Cursor | OpenVSX Registry | Eclipse Foundation账号 + PAT |
| Gitpod | OpenVSX Registry | 同上 |
| Theia | OpenVSX Registry | 同上 |

## 🔧 配置步骤

### 1. 获取OpenVSX Personal Access Token

#### 1.1 注册Eclipse Foundation账号
1. 访问 [accounts.eclipse.org](https://accounts.eclipse.org/)
2. 创建账号或使用现有账号登录
3. **重要**: 在账号信息中填写您的GitHub用户名

#### 1.2 登录OpenVSX并连接Eclipse账号
1. 访问 [open-vsx.org](https://open-vsx.org/)
2. 点击右上角登录，使用GitHub账号授权
3. 进入用户设置页面（点击头像 → Settings）
4. 点击 "Log in with Eclipse" 连接您的Eclipse账号

#### 1.3 签署发布者协议 🚨 **必需步骤**
1. 连接Eclipse账号成功后，您会看到 "Show Publisher Agreement" 按钮
2. 点击按钮，仔细阅读发布者协议内容
3. 阅读到底部后，点击 "Agree" 同意协议条款
4. **注意**: 未签署协议将无法发布任何扩展

#### 1.4 获取OpenVSX Access Token
1. 进入 Access Tokens 页面（Settings → Access Tokens）
2. 点击 "Generate New Token" 并输入描述
3. 点击 "Generate Token" 生成Token
4. 复制并保存Token（只显示一次）

### 2. 配置GitHub Secrets

在您的GitHub项目中添加以下Secrets：

```
设置路径: Settings → Secrets and variables → Actions → New repository secret
```

#### 必需的Secrets：
- `VSCE_PAT`: VSCode Marketplace Personal Access Token（已有）
- `OVSX_PAT`: OpenVSX Personal Access Token（新增）

### 3. 验证配置

#### 3.1 本地测试OpenVSX发布
```bash
# 安装OpenVSX CLI
npm install -g ovsx

# 创建namespace（替换YOUR_OVSX_PAT为您的实际Token）
ovsx create-namespace xkcoding -p YOUR_OVSX_PAT

# 验证Token权限（安全测试）
ovsx verify-pat xkcoding -p YOUR_OVSX_PAT
```

**注意**: 如果遇到 "You must sign a Publisher Agreement" 错误，请参考上述步骤1.3完成协议签署。

#### 3.2 验证CI/CD配置
1. 创建新的GitHub Release
2. 检查Actions工作流是否成功运行
3. 验证两个平台都成功发布

## 📦 技术实现详情

### CI/CD工作流更新

我们的发布工作流现在包含以下步骤：

```yaml
# 1. 构建扩展包
- name: Package extension
  run: npx @vscode/vsce package

# 2. 发布到VSCode Marketplace
- name: Publish to VSCode Marketplace
  env:
    VSCE_PAT: ${{ secrets.VSCE_PAT }}
  run: npx @vscode/vsce publish

# 3. 发布到OpenVSX Registry
- name: Publish to OpenVSX Registry
  env:
    OVSX_PAT: ${{ secrets.OVSX_PAT }}
  run: npx ovsx publish --pat $OVSX_PAT
```

### package.json依赖更新

新增了OpenVSX CLI工具：

```json
{
  "devDependencies": {
    "ovsx": "^0.8.3"
  }
}
```

## 🎯 发布流程

### 自动化发布
1. 在GitHub上创建新的Release
2. CI/CD自动触发，同时发布到两个平台
3. 验证发布结果

### 手动发布（紧急情况）
```bash
# VSCode Marketplace
vsce publish

# OpenVSX Registry  
ovsx publish your-extension.vsix --pat YOUR_OVSX_PAT
```

## 🔍 验证发布结果

### VSCode Marketplace
- 访问: [VSCode Marketplace - API Navigator](https://marketplace.visualstudio.com/items?itemName=xkcoding.xkcoding-api-navigator)
- 搜索: "API Navigator for Spring Boot"

### OpenVSX Registry
- 访问: [OpenVSX - API Navigator](https://open-vsx.org/extension/xkcoding/xkcoding-api-navigator)
- 在Cursor中搜索: "API Navigator"

## 🚨 常见问题与解决方案

### Q1: "You must sign a Publisher Agreement" 错误
**解决方案**: 必须先签署Eclipse Foundation发布者协议
1. 确保Eclipse账号已填写GitHub用户名
2. 在open-vsx.org连接Eclipse账号
3. 签署发布者协议（Show Publisher Agreement → Agree）
4. 协议签署后才能创建namespace和发布扩展

### Q2: OpenVSX发布失败 "Namespace not found"
**解决方案**: 需要先创建namespace
```bash
ovsx create-namespace xkcoding -p YOUR_OVSX_PAT
```

### Q3: 权限被拒绝
**解决方案**: 检查PAT权限和过期时间
- 确保Token有发布权限
- 检查Token是否过期
- 确认已签署发布者协议

### Q4: Cursor中搜索不到扩展
**解决方案**: 
1. 确认OpenVSX发布成功
2. 等待1-2小时同步时间
3. 清除Cursor缓存并重启

### Q5: 版本同步问题
**解决方案**: 确保两个平台版本号一致
- 使用相同的VSIX文件发布
- 检查package.json版本号

## 📊 发布状态监控

创建监控脚本检查发布状态：

```bash
#!/bin/bash
# check-publication-status.sh

VERSION=$(node -p "require('./package.json').version")
EXTENSION_ID="xkcoding.xkcoding-api-navigator"

echo "检查版本 $VERSION 的发布状态..."

# 检查VSCode Marketplace
echo "VSCode Marketplace:"
curl -s "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery" \
  -H "Content-Type: application/json" \
  -d "{\"filters\":[{\"criteria\":[{\"filterType\":7,\"value\":\"$EXTENSION_ID\"}]}]}" \
  | jq -r '.results[0].extensions[0].versions[0].version'

# 检查OpenVSX
echo "OpenVSX Registry:"
curl -s "https://open-vsx.org/api/xkcoding/xkcoding-api-navigator" \
  | jq -r '.version'
```

## 🎊 完成确认

发布完成后，您的扩展将在以下平台可用：

- ✅ **VSCode**: 通过内置扩展市场安装
- ✅ **Cursor**: 通过扩展面板搜索安装  
- ✅ **Gitpod**: 在工作空间中安装
- ✅ **其他基于VSCode的编辑器**: 根据其扩展来源配置

## 📞 支持与反馈

如遇到发布问题：
1. 检查GitHub Actions日志
2. 验证所有Secrets配置正确
3. 联系项目维护者获取支持

---

**创建时间**: 2025-07-28 17:49  
**维护者**: API Navigator 开发团队  
**版本**: v1.0 - 双平台发布配置指南 