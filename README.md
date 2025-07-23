# API Navigator

一个强大的 VSCode 扩展，帮助 Java Spring Boot 开发者快速导航和管理 REST API 端点。

## 📖 项目概述

API Navigator 是从 IntelliJ IDEA 插件 RestfulHelper 移植而来的 VSCode 扩展，专为 Spring Boot 项目设计，提供直观的 API 端点管理和导航功能。

## ✨ 主要功能

### 🎯 核心特性

- **🌲 侧边栏树视图**: 按控制器分组显示所有 REST API 端点
- **🔍 快速搜索**: 使用 `CMD+\` 快捷键快速查找 API 端点  
- **🚀 智能跳转**: 点击端点直接跳转到对应的控制器方法
- **⚡ 实时更新**: 文件变更时自动更新 API 索引
- **📊 统计信息**: 显示项目中的 API 统计信息

### 🏗️ 技术架构

- **🔄 Worker Threads**: 多线程并行解析 Java 文件，保证 UI 响应性
- **📈 增量更新**: 智能检测文件变更，只更新修改的部分
- **💾 持久化缓存**: 减少重复解析，提升启动速度  
- **🎨 直观 UI**: 符合 VSCode 设计规范的用户界面

## 🎯 支持的注解

当前版本支持以下 Spring Boot 注解：

### 控制器注解
- `@RestController`
- `@Controller`

### 请求映射注解  
- `@RequestMapping`
- `@GetMapping` 
- `@PostMapping`
- `@PutMapping`
- `@DeleteMapping`
- `@PatchMapping`

### 参数注解
- `@PathVariable`
- `@RequestParam` 
- `@RequestBody`

## 🚀 快速开始

### 安装要求

- VSCode 1.60.0+
- Java 项目 (Spring Boot 推荐)
- Node.js 16+ (开发环境)

### 安装插件

1. 在 VSCode 扩展市场搜索 "API Navigator"
2. 点击安装
3. 重新加载 VSCode

### 使用方法

1. **打开 Java Spring Boot 项目**
2. **查看侧边栏**: 在资源管理器中找到 "API Navigator" 面板
3. **快速搜索**: 按 `CMD+\` 打开 API 搜索
4. **跳转代码**: 点击任意 API 端点跳转到对应代码

## 📊 性能指标

- ⚡ **启动时间**: < 3秒 (1000个文件以内)
- 🔍 **搜索响应**: < 200ms
- 💾 **内存使用**: < 100MB  
- 📝 **文件更新**: < 500ms 延迟

## 🛠️ 开发状态

### ✅ 已完成功能

- [x] **基础架构**: TypeScript + VSCode Extension API
- [x] **Java 解析器**: 基于 java-ast 库的 Spring 注解解析
- [x] **Worker Threads**: 多线程异步处理架构  
- [x] **API 索引器**: 智能索引管理和搜索
- [x] **侧边栏 UI**: 树视图显示和交互
- [x] **快速搜索**: CMD+\ 快捷键搜索功能
- [x] **代码跳转**: 点击端点跳转到源码位置
- [x] **文件监控**: 实时检测 Java 文件变更

### 🚧 进行中

- [ ] **测试验证**: 在真实 Spring Boot 项目中测试
- [ ] **性能优化**: 大型项目性能调优
- [ ] **错误处理**: 完善异常情况处理

### 📋 待开发  

- [ ] **高级搜索**: 按 HTTP 方法、路径模式过滤
- [ ] **API 文档**: 集成 Swagger/OpenAPI 文档
- [ ] **测试集成**: API 测试工具集成
- [ ] **多框架支持**: Micronaut、JAX-RS 支持

## 🏗️ 项目架构

### 核心组件

```
src/
├── core/                   # 核心业务逻辑
│   ├── JavaASTParser.ts   # Java AST 解析器
│   ├── ApiIndexer.ts      # API 索引管理器  
│   ├── WorkerPool.ts      # 工作线程池
│   └── types.ts           # 类型定义
├── ui/                     # 用户界面组件
│   ├── ApiNavigatorProvider.ts  # 侧边栏树视图
│   └── SearchProvider.ts       # 快速搜索面板
├── workers/               # 工作线程
│   └── worker.ts         # Worker 脚本
└── extension.ts          # 插件入口
```

### 技术栈

- **语言**: TypeScript  
- **运行时**: Node.js 16+
- **平台**: VSCode Extension API 1.60+
- **构建工具**: TypeScript Compiler
- **Java 解析**: java-ast 库
- **并发处理**: Worker Threads

## 🤝 贡献指南

欢迎贡献代码！请查看我们的贡献指南：

1. Fork 项目
2. 创建功能分支: `git checkout -b feature/new-feature`  
3. 提交修改: `git commit -am 'Add new feature'`
4. 推送分支: `git push origin feature/new-feature`
5. 创建 Pull Request

## 📄 许可证

本项目基于 MIT 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- 原 IntelliJ IDEA 插件 [RestfulHelper](RestfulHelper/) 
- VSCode Extension API 文档和社区
- java-ast 库开发者

## 📞 联系我们

- **作者**: xkcoding (Yangkai.Shen)
- **邮箱**: 237497819@qq.com  
- **GitHub**: https://github.com/xkcoding/API-Navigator

---

**🌟 如果这个项目对你有帮助，请给我们一个 Star！** 