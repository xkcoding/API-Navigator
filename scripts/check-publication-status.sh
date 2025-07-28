#!/bin/bash

# 双平台发布状态检查脚本
# 用途：检查API Navigator扩展在VSCode Marketplace和OpenVSX的发布状态

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取当前版本
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
EXTENSION_ID="xkcoding.xkcoding-api-navigator"

echo -e "${BLUE}=== API Navigator 双平台发布状态检查 ===${NC}"
echo -e "扩展ID: ${YELLOW}$EXTENSION_ID${NC}"
echo -e "当前版本: ${YELLOW}v$VERSION${NC}"
echo ""

# 检查VSCode Marketplace
echo -e "${BLUE}1. 检查 VSCode Marketplace...${NC}"
VSCODE_VERSION=""
if command -v curl &> /dev/null && command -v jq &> /dev/null; then
    VSCODE_RESPONSE=$(curl -s "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery" \
        -H "Content-Type: application/json" \
        -d "{\"filters\":[{\"criteria\":[{\"filterType\":7,\"value\":\"$EXTENSION_ID\"}]}]}" 2>/dev/null || echo "")
    
    if [ ! -z "$VSCODE_RESPONSE" ]; then
        VSCODE_VERSION=$(echo "$VSCODE_RESPONSE" | jq -r '.results[0].extensions[0].versions[0].version' 2>/dev/null || echo "")
        if [ "$VSCODE_VERSION" != "null" ] && [ ! -z "$VSCODE_VERSION" ]; then
            echo -e "   ✅ ${GREEN}已发布${NC} - 版本: v$VSCODE_VERSION"
            echo -e "   🔗 链接: https://marketplace.visualstudio.com/items?itemName=$EXTENSION_ID"
        else
            echo -e "   ❌ ${RED}未找到或解析失败${NC}"
        fi
    else
        echo -e "   ⚠️  ${YELLOW}网络请求失败${NC}"
    fi
else
    echo -e "   ⚠️  ${YELLOW}需要 curl 和 jq 工具${NC}"
fi

echo ""

# 检查OpenVSX Registry
echo -e "${BLUE}2. 检查 OpenVSX Registry...${NC}"
OPENVSX_VERSION=""
if command -v curl &> /dev/null && command -v jq &> /dev/null; then
    OPENVSX_RESPONSE=$(curl -s "https://open-vsx.org/api/xkcoding/xkcoding-api-navigator" 2>/dev/null || echo "")
    
    if [ ! -z "$OPENVSX_RESPONSE" ]; then
        OPENVSX_VERSION=$(echo "$OPENVSX_RESPONSE" | jq -r '.version' 2>/dev/null || echo "")
        if [ "$OPENVSX_VERSION" != "null" ] && [ ! -z "$OPENVSX_VERSION" ]; then
            echo -e "   ✅ ${GREEN}已发布${NC} - 版本: v$OPENVSX_VERSION"
            echo -e "   🔗 链接: https://open-vsx.org/extension/xkcoding/xkcoding-api-navigator"
        else
            echo -e "   ❌ ${RED}未找到或解析失败${NC}"
        fi
    else
        echo -e "   ⚠️  ${YELLOW}网络请求失败${NC}"
    fi
else
    echo -e "   ⚠️  ${YELLOW}需要 curl 和 jq 工具${NC}"
fi

echo ""

# 版本对比分析
echo -e "${BLUE}3. 版本同步分析...${NC}"
if [ ! -z "$VSCODE_VERSION" ] && [ ! -z "$OPENVSX_VERSION" ]; then
    if [ "$VSCODE_VERSION" = "$OPENVSX_VERSION" ]; then
        echo -e "   ✅ ${GREEN}版本同步${NC} - 两个平台版本一致 (v$VSCODE_VERSION)"
    else
        echo -e "   ⚠️  ${YELLOW}版本不同步${NC}"
        echo -e "      VSCode Marketplace: v$VSCODE_VERSION"
        echo -e "      OpenVSX Registry:   v$OPENVSX_VERSION"
    fi
elif [ ! -z "$VSCODE_VERSION" ] && [ -z "$OPENVSX_VERSION" ]; then
    echo -e "   ⚠️  ${YELLOW}仅在VSCode Marketplace发布${NC} - 建议发布到OpenVSX"
elif [ -z "$VSCODE_VERSION" ] && [ ! -z "$OPENVSX_VERSION" ]; then
    echo -e "   ⚠️  ${YELLOW}仅在OpenVSX发布${NC} - 建议发布到VSCode Marketplace"
else
    echo -e "   ❌ ${RED}两个平台都未检测到发布${NC}"
fi

echo ""

# 编辑器支持状态
echo -e "${BLUE}4. 编辑器支持状态...${NC}"
if [ ! -z "$VSCODE_VERSION" ]; then
    echo -e "   ✅ ${GREEN}VSCode${NC} - 支持安装"
else
    echo -e "   ❌ ${RED}VSCode${NC} - 不支持安装"
fi

if [ ! -z "$OPENVSX_VERSION" ]; then
    echo -e "   ✅ ${GREEN}Cursor${NC} - 支持安装"
    echo -e "   ✅ ${GREEN}Gitpod${NC} - 支持安装"
    echo -e "   ✅ ${GREEN}Theia${NC} - 支持安装"
else
    echo -e "   ❌ ${RED}Cursor${NC} - 不支持安装"
    echo -e "   ❌ ${RED}Gitpod${NC} - 不支持安装"
    echo -e "   ❌ ${RED}Theia${NC} - 不支持安装"
fi

echo ""

# 建议操作
echo -e "${BLUE}5. 建议操作...${NC}"
if [ -z "$OPENVSX_VERSION" ]; then
    echo -e "   📝 ${YELLOW}建议配置OpenVSX发布${NC}"
    echo -e "      1. 获取OpenVSX Personal Access Token"
    echo -e "      2. 配置GitHub Secret: OVSX_PAT"
    echo -e "      3. 创建新的GitHub Release触发发布"
    echo -e "      4. 详细步骤参见: docs/dual-marketplace-setup.md"
elif [ "$VSCODE_VERSION" != "$OPENVSX_VERSION" ]; then
    echo -e "   📝 ${YELLOW}建议同步版本${NC}"
    echo -e "      创建新的GitHub Release统一两个平台版本"
else
    echo -e "   ✅ ${GREEN}一切正常${NC} - 双平台发布已完成且版本同步"
fi

echo ""
echo -e "${BLUE}=== 检查完成 ===${NC}"

# 设置退出代码
if [ ! -z "$VSCODE_VERSION" ] && [ ! -z "$OPENVSX_VERSION" ] && [ "$VSCODE_VERSION" = "$OPENVSX_VERSION" ]; then
    exit 0  # 完美状态
elif [ ! -z "$VSCODE_VERSION" ] || [ ! -z "$OPENVSX_VERSION" ]; then
    exit 1  # 部分发布
else
    exit 2  # 未发布
fi 