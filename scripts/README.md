# 自动化打包脚本

这个目录包含API Navigator扩展的自动化打包脚本，支持动态版本号管理和完整的构建验证流程。

## 📁 文件说明

| 文件 | 平台 | 描述 |
|------|------|------|
| `build.sh` | Linux/macOS | Bash脚本，完整的构建和打包流程 |
| `build.ps1` | Windows | PowerShell脚本，Windows平台构建 |

## 🚀 使用方法

### Linux/macOS (Bash)

```bash
# 给脚本添加执行权限
chmod +x scripts/build.sh

# 执行完整构建流程
./scripts/build.sh
```

### Windows (PowerShell)

```powershell
# 执行完整构建流程
./scripts/build.ps1

# 跳过测试执行 (快速打包)
./scripts/build.ps1 -SkipTests
```

## 🔧 脚本功能

### 自动化流程
1. **环境检查**: 验证Node.js和vsce工具安装
2. **版本获取**: 从`package.json`动态读取版本号
3. **文件清理**: 自动清理旧的VSIX文件
4. **代码编译**: 执行TypeScript编译
5. **功能测试**: 运行核心功能测试 (可选)
6. **扩展打包**: 生成带版本号前缀的VSIX文件
7. **结果展示**: 显示文件大小和安装命令

### 输出示例
```
🚀 API Navigator 扩展打包开始...
📋 检查环境依赖...
✅ 环境检查完成
📦 准备打包版本: v1.0.3
🧹 清理旧版本文件...
🔨 编译TypeScript代码...
✅ TypeScript编译成功
🧪 运行核心功能测试...
✅ 核心测试通过
📦 打包扩展文件...
✅ 扩展打包成功
🎉 成功生成: xkcoding-api-navigator-v1.0.3.vsix (2.77 MB)
💡 安装命令: code --install-extension xkcoding-api-navigator-v1.0.3.vsix
🎊 打包完成！
```

## 📋 版本命名规范

脚本遵循以下命名规范：
- **格式**: `xkcoding-api-navigator-v{version}.vsix`
- **示例**: `xkcoding-api-navigator-v1.0.3.vsix`
- **版本源**: 自动从`package.json`的`version`字段获取
- **前缀**: 统一使用"v"前缀符合版本管理惯例

## 🛠️ 故障排除

### 常见问题

**问题**: `command not found: vsce`
```bash
# 解决方案
npm install -g @vscode/vsce --force
```

**问题**: `permission denied`
```bash
# Linux/macOS解决方案
chmod +x scripts/build.sh
```

**问题**: PowerShell执行策略限制
```powershell
# Windows解决方案
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**问题**: TypeScript编译错误
```bash
# 确保依赖已安装
npm install
npm run compile
```

## 📖 更多信息

详细的打包验证流程请参考：[local-verification-guide.md](../local-verification-guide.md) 