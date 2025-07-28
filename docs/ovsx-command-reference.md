# OpenVSX CLI 命令参考

## 🛠️ 常用命令

### 1. 创建命名空间
```bash
ovsx create-namespace <namespace> -p <token>

# 示例
export OVSX_PAT="your_token"
ovsx create-namespace xkcoding -p $OVSX_PAT
```

### 2. 验证Token权限
```bash
ovsx verify-pat [namespace] -p <token>

# 验证特定命名空间权限
ovsx verify-pat xkcoding -p $OVSX_PAT

# 验证Token基本有效性（不指定命名空间）
ovsx verify-pat -p $OVSX_PAT
```

### 3. 发布扩展
```bash
ovsx publish [options] [extension.vsix] -p <token>

# 发布已打包的扩展
ovsx publish xkcoding-api-navigator-v1.0.3.vsix -p $OVSX_PAT

# 从当前目录打包并发布
ovsx publish -p $OVSX_PAT
```

### 4. 查看命令帮助
```bash
# 查看主帮助
ovsx --help

# 查看特定命令帮助
ovsx publish --help
ovsx create-namespace --help
```

## ⚠️ 重要说明

### 没有 --dry-run 选项
❌ **错误用法**:
```bash
ovsx publish extension.vsix --pat TOKEN --dry-run  # 此选项不存在！
```

✅ **正确的测试方法**:
```bash
# 1. 先验证Token权限
ovsx verify-pat xkcoding -p $OVSX_PAT

# 2. 然后直接发布（无法预览，但操作安全）
ovsx publish extension.vsix -p $OVSX_PAT
```

### 安全测试流程
```bash
# 步骤1：验证环境
ovsx --version

# 步骤2：验证Token
export OVSX_PAT="your_token"
ovsx verify-pat xkcoding -p $OVSX_PAT

# 步骤3：确认已创建命名空间
# 如果提示namespace not found，先创建：
# ovsx create-namespace xkcoding -p $OVSX_PAT

# 步骤4：发布扩展
ovsx publish your-extension.vsix -p $OVSX_PAT
```

## 📋 命令选项说明

### 全局选项
- `-r, --registryUrl <url>`: 指定注册表URL（默认：open-vsx.org）
- `-p, --pat <token>`: Personal Access Token
- `--debug`: 错误时包含调试信息
- `-V, --version`: 显示版本
- `-h, --help`: 显示帮助

### publish 命令选项
```bash
ovsx publish --help
```
常用选项：
- `-p, --pat <token>`: Personal Access Token
- `--packagePath <path>`: 指定要发布的包路径
- `--yarn`: 使用yarn而非npm来运行脚本

### 示例：完整发布流程
```bash
#!/bin/bash

# 设置环境变量
export OVSX_PAT="your_openvsx_token"

# 验证Token
echo "验证Token权限..."
if ovsx verify-pat xkcoding -p $OVSX_PAT; then
    echo "✅ Token验证成功"
else
    echo "❌ Token验证失败，请检查Token或创建命名空间"
    exit 1
fi

# 检查扩展文件
VSIX_FILE="xkcoding-api-navigator-v1.0.3.vsix"
if [ ! -f "$VSIX_FILE" ]; then
    echo "❌ 找不到扩展文件: $VSIX_FILE"
    exit 1
fi

# 发布扩展
echo "发布扩展到OpenVSX..."
if ovsx publish "$VSIX_FILE" -p $OVSX_PAT; then
    echo "✅ 发布成功！"
    echo "🔗 检查发布状态：https://open-vsx.org/extension/xkcoding/xkcoding-api-navigator"
else
    echo "❌ 发布失败"
    exit 1
fi
```

## 🔍 故障排除

### 常见错误及解决方案

1. **"unknown option '--dry-run'"**
   - 原因：ovsx不支持此选项
   - 解决：使用 `verify-pat` 验证权限

2. **"Namespace not found"**
   - 原因：命名空间未创建
   - 解决：`ovsx create-namespace xkcoding -p $OVSX_PAT`

3. **"You must sign a Publisher Agreement"**
   - 原因：未签署发布者协议
   - 解决：参考 `docs/openvsx-publisher-agreement-guide.md`

4. **"Invalid token"**
   - 原因：Token过期或无效
   - 解决：在OpenVSX重新生成Token

## 📚 相关文档

- [OpenVSX发布者协议指南](./openvsx-publisher-agreement-guide.md)
- [双平台发布配置](./dual-marketplace-setup.md)
- [OpenVSX官方文档](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)

---

**更新时间**: 2025-07-28 18:05  
**版本**: v1.0 - 修复命令参考 