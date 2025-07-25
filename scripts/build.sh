#!/bin/bash

# API Navigator 扩展自动化打包脚本
# 使用动态版本号，遵循 v{version} 命名规范

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 API Navigator 扩展打包开始...${NC}"

# 检查依赖
echo -e "${YELLOW}📋 检查环境依赖...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi

if ! command -v vsce &> /dev/null; then
    echo -e "${RED}❌ @vscode/vsce 未安装${NC}"
    echo -e "${YELLOW}💡 请运行: npm install -g @vscode/vsce --force${NC}"
    exit 1
fi

# 获取版本号
VERSION=$(node -p "require('./package.json').version")
FILENAME="xkcoding-api-navigator-v${VERSION}.vsix"

echo -e "${GREEN}✅ 环境检查完成${NC}"
echo -e "${BLUE}📦 准备打包版本: v${VERSION}${NC}"

# 清理旧版本
echo -e "${YELLOW}🧹 清理旧版本文件...${NC}"
if ls xkcoding-api-navigator-v*.vsix 1> /dev/null 2>&1; then
    rm -f xkcoding-api-navigator-v*.vsix
    echo -e "${GREEN}✅ 旧版本文件已清理${NC}"
fi

# 编译TypeScript
echo -e "${YELLOW}🔨 编译TypeScript代码...${NC}"
npm run compile
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ TypeScript编译成功${NC}"
else
    echo -e "${RED}❌ TypeScript编译失败${NC}"
    exit 1
fi

# 运行核心测试
echo -e "${YELLOW}🧪 运行核心功能测试...${NC}"
npm test -- test/core/JavaASTParser.test.ts --silent
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 核心测试通过${NC}"
else
    echo -e "${RED}❌ 核心测试失败${NC}"
    exit 1
fi

# 打包扩展
echo -e "${YELLOW}📦 打包扩展文件...${NC}"
vsce package --out "${FILENAME}"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 扩展打包成功${NC}"
else
    echo -e "${RED}❌ 扩展打包失败${NC}"
    exit 1
fi

# 显示结果
echo -e "${BLUE}📊 打包结果:${NC}"
ls -la "${FILENAME}"
FILE_SIZE=$(du -h "${FILENAME}" | cut -f1)
echo -e "${GREEN}🎉 成功生成: ${FILENAME} (${FILE_SIZE})${NC}"

# 提供安装命令
echo -e "${BLUE}💡 安装命令:${NC}"
echo -e "${YELLOW}code --install-extension ${FILENAME}${NC}"

echo -e "${GREEN}🎊 打包完成！${NC}" 