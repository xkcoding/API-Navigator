# API Navigator

## 📖 项目概述

API Navigator 是一个基于 VSCode/Cursor 的插件，旨在帮助开发者快速导航和管理 Spring Boot 项目中的 REST API 端点。本项目是将现有的 [RestfulHelper IDEA 插件](https://github.com/Nayacco/RestfulHelper) 转换为 VSCode 生态的重新架构版本。

## 🎯 项目目标

将 RestfulHelper IDEA 插件的核心功能迁移到 VSCode/Cursor 平台：

### 核心功能
- **侧边栏 API 浏览**: 在左侧边栏以树形结构展示所有 REST API 端点
- **HTTP 方法标识**: 清晰显示 GET、POST、PUT、DELETE、PATCH 等方法类型
- **快捷键搜索**: 支持 `CMD+\` 或 `CMD+SHIFT+P` 快速查找和跳转到接口
- **实时同步**: 代码变更时自动更新 API 端点索引
- **代码导航**: 点击端点直接跳转到对应的控制器方法

### 技术特性
- **Spring Boot 支持**: 第一版专注于 Spring Boot 注解体系
- **高性能**: 基于 Worker Threads 的异步解析架构
- **智能缓存**: 增量更新和持久化缓存机制
- **路径组合**: 正确处理类级别 `@RequestMapping` + 方法级别映射注解的组合

## 🏗️ 架构设计

### 技术栈
- **主要语言**: TypeScript
- **运行时**: Node.js 16+
- **平台**: VSCode Extension API 1.60+
- **构建工具**: Webpack 5.x + TypeScript Compiler
- **Java 解析**: java-ast 库
- **异步处理**: Worker Threads 池

### 核心架构
- **混合架构**: Worker Threads + 增量更新 + 持久化缓存
- **自适应性能**: 根据项目规模选择最佳处理策略
- **组合模式**: 智能处理 Spring 注解路径组合

### 性能目标
- 启动时间 < 3秒（1000个文件以内）
- 搜索响应 < 200ms
- 内存使用 < 100MB
- 文件更新延迟 < 500ms

## 📂 项目结构

```
API Navigator/
├── .cursor/                     # Cursor 编辑器配置
├── .git/                        # Git 仓库配置
├── .gitignore                   # Git 忽略规则
├── .gitmodules                  # Git 子模块配置
├── .memory-bank/                # Memory Bank 系统配置文件
├── .specstory/                  # 项目规格和开发历史记录
├── LICENSE                      # MIT 开源许可证
├── README.md                    # 项目说明文档
├── memory-bank/                 # Memory Bank 系统（开发过程管理）
│   ├── tasks.md                 # 任务跟踪
│   ├── activeContext.md         # 活跃上下文
│   ├── creative/                # 创意阶段文档
│   │   └── creative-plugin-architecture.md
│   ├── techContext.md           # 技术上下文
│   ├── systemPatterns.md        # 系统模式
│   └── ...                      # 其他 Memory Bank 文档
├── RestfulHelper/               # 原始 IDEA 插件源码（Git 子模块）
│   └── src/main/kotlin/...
└── api-navigator/               # 新 VSCode 插件项目（待创建）
    ├── src/
    ├── package.json
    └── ...
```

## 🚀 开发状态

### ✅ 已完成
- [x] Memory Bank 系统初始化
- [x] 项目复杂度评估 (Level 4 - 复杂系统任务)
- [x] 创意阶段架构设计
- [x] Spring Boot 注解组合逻辑设计
- [x] 技术栈选型和性能策略制定
- [x] Git 仓库初始化

### 🔄 当前阶段
**CREATIVE 阶段已完成** → **准备进入 IMPLEMENT 阶段**

### 📋 下一步计划
1. **环境搭建**: 创建 VSCode Extension 开发环境
2. **项目结构**: 建立 api-navigator 插件项目结构
3. **核心模块**: 实现 Java AST 解析器原型
4. **Worker Threads**: 开发异步处理架构
5. **UI 组件**: 构建侧边栏树视图和搜索功能

## 🔄 Spring 注解组合逻辑

本项目的核心特性之一是正确处理 Spring Boot 的注解组合：

```java
@RestController
@RequestMapping("/api/users")    // 类级别基础路径
public class UserController {
    
    @GetMapping("/{id}")         // 组合后: GET /api/users/{id}
    public User getUser(@PathVariable Long id) {}
    
    @PostMapping("/register")    // 组合后: POST /api/users/register  
    public User createUser(@RequestBody User user) {}
}
```

## 🚀 快速开始

### 克隆项目
由于本项目使用了 Git 子模块，请使用以下命令完整克隆项目：

```bash
# 克隆项目和所有子模块
git clone --recursive git@github.com:xkcoding/API-Navigator.git

# 或者先克隆主项目，再初始化子模块
git clone git@github.com:xkcoding/API-Navigator.git
cd API-Navigator
git submodule update --init --recursive
```

### AI 结对编程环境复刻 🤖

本项目包含完整的 AI 开发工具配置，帮助您快速复刻相同的开发环境：

#### **Cursor 编辑器配置**
- **位置**: `.cursor/` 目录
- **作用**: Cursor 编辑器的项目配置和偏好设置
- **使用方法**: 用 Cursor 打开项目，配置将自动加载

#### **Memory Bank 系统**
- **位置**: `.memory-bank/` 目录（配置文件）+ `memory-bank/` 目录（工作文档）
- **作用**: 结构化的项目开发过程管理系统
- **功能**: 任务跟踪、架构设计、技术决策记录、开发历史
- **使用方法**: 配合支持 Memory Bank 的 AI 助手使用

#### **Spec Story 项目记录**
- **位置**: `.specstory/` 目录
- **作用**: 项目规格说明和开发历史追踪
- **功能**: 记录需求变更、技术决策历程、开发里程碑

#### 开始 AI 结对编程
1. 使用 Cursor 编辑器打开项目
2. AI 助手将自动识别 Memory Bank 系统
3. 通过 Memory Bank 文档了解项目当前状态
4. 继续开发或分析项目架构

### 更新 RestfulHelper 子模块
当需要同步上游 RestfulHelper 的最新功能时：

```bash
# 检查是否有更新
cd RestfulHelper
git fetch
git log HEAD..origin/main --oneline

# 更新到最新版本
cd ..
git submodule update --remote RestfulHelper
git add RestfulHelper
git commit -m "📦 更新 RestfulHelper 子模块到最新版本"
```

## 🤝 贡献

本项目基于 [RestfulHelper](https://github.com/Nayacco/RestfulHelper) 的架构思想，致力于为 VSCode 用户提供同样优秀的 API 导航体验。

## 📄 许可证

[MIT License](LICENSE)

---

**注**: 这是一个正在积极开发中的项目，当前版本仅支持 Java Spring Boot 框架。 