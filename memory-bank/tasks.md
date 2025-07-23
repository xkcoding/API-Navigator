# 任务跟踪

## 当前任务: 转换 IDEA 插件为 VSCode/Cursor 插件

### 项目目标
将现有的 RestfulHelper IDEA 插件转换为 api-navigator VSCode/Cursor 插件

### 具体要求
1. **技术限制**: 第一版仅支持 Java SpringBoot，不支持其他语言和框架
2. **侧边栏功能**: 左侧边栏列出所有接口地址，显示 GET、POST 等标识，支持跳转定位
3. **快捷键搜索**: 支持 CMD+\ 或 CMD+SHIFT+P 快速查找接口地址
4. **实时更新**: 项目中添加新端点时，同步更新索引和定位功能
5. **插件命名**: 新插件名为 api-navigator

### 复杂度评估结果: **Level 4 - 复杂系统任务**

**理由分析:**
- **跨平台迁移**: 从 IntelliJ Platform 架构迁移到 VSCode Extension API
- **语言解析**: 需要重新设计 Java 代码解析和 AST 分析
- **多个核心功能**: 侧边栏、快速搜索、实时监控、代码导航
- **复杂技术栈**: 需要掌握 VSCode Extension API、Java 解析、文件监控等
- **架构设计**: 需要完整的插件架构设计和模块规划

## 创意阶段完成 ✅

### 架构设计决策
- **核心架构**: 混合架构（Worker Threads + 增量更新 + 持久化缓存）
- **Java 解析器**: java-ast 库（专门为 Java 设计）
- **性能策略**: 自适应性能策略（全量扫描 vs 增量更新）
- **UI 设计**: VSCode TreeView + QuickPick 搜索面板

### 技术栈确定
- **主要语言**: TypeScript
- **运行时**: Node.js 16+
- **平台**: VSCode Extension API 1.60+
- **构建工具**: Webpack 5.x + TypeScript Compiler
- **Java 解析**: java-ast 库
- **异步处理**: Worker Threads 池

### 性能目标
- 启动时间 < 3秒（1000个文件以内）
- 搜索响应 < 200ms
- 内存使用 < 100MB
- 文件更新延迟 < 500ms

## 任务历史
- 初始化 Memory Bank 结构 - 已完成
- 复杂度评估 - 已完成
- 创意阶段架构设计 - 已完成 ✅

## 下一阶段: IMPLEMENT
**准备开始实施阶段，创建 VSCode 插件项目结构和核心功能** 