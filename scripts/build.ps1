# API Navigator 扩展自动化打包脚本 (PowerShell)
# 使用动态版本号，遵循 v{version} 命名规范

param(
    [switch]$SkipTests = $false  # 可选参数：跳过测试
)

# 设置错误时停止
$ErrorActionPreference = "Stop"

Write-Host "🚀 API Navigator 扩展打包开始..." -ForegroundColor Blue

# 检查依赖
Write-Host "📋 检查环境依赖..." -ForegroundColor Yellow

try {
    $null = Get-Command node -ErrorAction Stop
} catch {
    Write-Host "❌ Node.js 未安装" -ForegroundColor Red
    exit 1
}

try {
    $null = Get-Command vsce -ErrorAction Stop
} catch {
    Write-Host "❌ @vscode/vsce 未安装" -ForegroundColor Red
    Write-Host "💡 请运行: npm install -g @vscode/vsce --force" -ForegroundColor Yellow
    exit 1
}

# 获取版本号
try {
    $version = node -p "require('./package.json').version"
    $filename = "xkcoding-api-navigator-v$version.vsix"
} catch {
    Write-Host "❌ 无法读取package.json版本号" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 环境检查完成" -ForegroundColor Green
Write-Host "📦 准备打包版本: v$version" -ForegroundColor Blue

# 清理旧版本
Write-Host "🧹 清理旧版本文件..." -ForegroundColor Yellow
$oldFiles = Get-ChildItem "xkcoding-api-navigator-v*.vsix" -ErrorAction SilentlyContinue
if ($oldFiles) {
    Remove-Item "xkcoding-api-navigator-v*.vsix" -Force
    Write-Host "✅ 旧版本文件已清理" -ForegroundColor Green
}

# 编译TypeScript
Write-Host "🔨 编译TypeScript代码..." -ForegroundColor Yellow
try {
    npm run compile
    Write-Host "✅ TypeScript编译成功" -ForegroundColor Green
} catch {
    Write-Host "❌ TypeScript编译失败" -ForegroundColor Red
    exit 1
}

# 运行核心测试 (可选)
if (-not $SkipTests) {
    Write-Host "🧪 运行核心功能测试..." -ForegroundColor Yellow
    try {
        npm test -- test/core/JavaASTParser.test.ts --silent
        Write-Host "✅ 核心测试通过" -ForegroundColor Green
    } catch {
        Write-Host "❌ 核心测试失败" -ForegroundColor Red
        exit 1
    }
}

# 打包扩展
Write-Host "📦 打包扩展文件..." -ForegroundColor Yellow
try {
    vsce package --out $filename
    Write-Host "✅ 扩展打包成功" -ForegroundColor Green
} catch {
    Write-Host "❌ 扩展打包失败" -ForegroundColor Red
    exit 1
}

# 显示结果
Write-Host "📊 打包结果:" -ForegroundColor Blue
$fileInfo = Get-Item $filename
$fileSize = [math]::Round($fileInfo.Length / 1MB, 2)
Write-Host "🎉 成功生成: $filename ($fileSize MB)" -ForegroundColor Green

# 提供安装命令
Write-Host "💡 安装命令:" -ForegroundColor Blue
Write-Host "code --install-extension $filename" -ForegroundColor Yellow

Write-Host "🎊 打包完成！" -ForegroundColor Green 