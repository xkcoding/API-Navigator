# 技术上下文

## 目标技术栈 (VSCode 插件)

### 核心技术
- **语言**: TypeScript (主要), JavaScript (支持)
- **运行时**: Node.js 16+ 
- **平台**: VSCode Extension API 1.60+
- **构建工具**: Webpack 5.x + TypeScript Compiler
- **包管理**: npm 或 yarn

### 关键依赖
```json
{
  "dependencies": {
    "vscode": "^1.60.0",
    "java-ast": "^1.0.0",
    "fuse.js": "^6.6.0",
    "chokidar": "^3.5.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.60.0",
    "@types/node": "^16.0.0",
    "typescript": "^4.5.0",
    "webpack": "^5.0.0",
    "jest": "^27.0.0"
  }
}
```

### VSCode Extension API
1. **TreeView API**: 侧边栏树形视图
   - `vscode.window.createTreeView()`
   - `TreeDataProvider` 接口
   - 树节点导航和操作

2. **Command API**: 命令和快捷键
   - `vscode.commands.registerCommand()`
   - 快捷键绑定和命令面板集成
   - 上下文菜单命令

3. **File System API**: 文件系统访问
   - `vscode.workspace.fs.*`
   - 文件监听和变更检测
   - 工作区文件管理

4. **Language API**: 语言特性支持
   - `TextDocument` 操作
   - 代码导航和跳转
   - 符号提取和定位

### Java 解析技术
1. **Java AST 解析**
   - **选项 1**: `java-ast` - 轻量级 Java 解析器
   - **选项 2**: `@babel/parser` + Java 语法扩展
   - **选项 3**: 自研正则表达式解析器

2. **注解提取策略**
   - AST 节点遍历
   - 注解属性解析
   - 类和方法关系分析

### Spring Boot 支持范围
仅支持以下注解 (第一版):
1. **控制器注解**
   - `@RestController`
   - `@Controller`

2. **映射注解组合逻辑** ⭐
   - **类级别**: `@RequestMapping("/api/users")` - 定义基础路径
   - **方法级别**: `@GetMapping("/{id}")`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`
   - **组合结果**: 完整路径 = 类路径 + 方法路径 (如: `/api/users/{id}`)
   - **特殊情况**: `@RequestMapping` 也可用于方法级别，需支持 `method` 属性解析

3. **参数注解**
   - `@PathVariable`
   - `@RequestParam` (基础支持)

#### 注解组合示例
```java
@RestController
@RequestMapping("/api/users")    // 类级别基础路径
public class UserController {
    
    @GetMapping("/{id}")         // 组合后: GET /api/users/{id}
    public User getUser(@PathVariable Long id) {}
    
    @PostMapping("/register")    // 组合后: POST /api/users/register  
    public User createUser(@RequestBody User user) {}
    
    @RequestMapping(value = "/search", method = RequestMethod.GET)
    public List<User> searchUsers() {} // 组合后: GET /api/users/search
}
```

### 开发工具链
- **IDE**: VSCode 或 Cursor
- **调试**: VSCode Extension Development Host
- **测试**: Jest + VSCode Extension Test Runner
- **打包**: vsce (Visual Studio Code Extension Manager)
- **CI/CD**: GitHub Actions

### 项目结构
```
api-navigator/
├── src/
│   ├── extension.ts          # 插件入口点
│   ├── core/                 # 核心业务逻辑
│   ├── providers/            # VSCode 服务提供者
│   ├── utils/                # 工具函数
│   ├── types/                # TypeScript 类型定义
│   └── workers/              # Worker Thread 脚本
├── package.json              # 插件配置和依赖
├── tsconfig.json             # TypeScript 配置
├── webpack.config.js         # 构建配置
├── README.md                 # 用户文档
└── CHANGELOG.md              # 版本历史
```

### Worker Threads 配置
```typescript
interface WorkerMessage {
  type: 'PARSE_FILE' | 'BATCH_PARSE' | 'CACHE_UPDATE'
  payload: {
    filePath?: string
    filePaths?: string[]
    fileContent?: string
    cacheKey?: string
  }
}

interface WorkerResponse {
  type: 'PARSE_RESULT' | 'ERROR' | 'PROGRESS'
  data: ApiEndpoint[] | ErrorInfo | ProgressInfo
}
```

### 缓存策略
1. **内存缓存**
   - 使用 Map 和 WeakMap
   - LRU 淘汰策略
   - 最大 50MB 限制

2. **文件系统缓存**
   - 存储在 `~/.vscode/extensions/api-navigator/cache/`
   - JSON 格式序列化
   - 基于文件修改时间的失效策略

### 性能优化技术
1. **异步处理**
   - Worker Threads 用于 CPU 密集型任务
   - Promise/async-await 模式
   - 批处理和队列管理

2. **增量更新**
   - 文件变更差异检测
   - 仅重新解析修改的文件
   - 智能缓存失效

3. **内存管理**
   - 及时释放大对象引用
   - 使用 WeakMap 避免内存泄漏
   - 定期垃圾回收提示

### 兼容性要求
- **VSCode**: 版本 1.60+ (2021年8月)
- **Cursor**: 最新版本
- **Node.js**: 16.x+ (插件运行时)
- **操作系统**: Windows 10+, macOS 10.15+, Linux Ubuntu 18.04+

### 部署和分发
1. **开发阶段**
   - 本地 Extension Development Host 测试
   - 单元测试和集成测试

2. **发布流程**
   - `vsce package` 生成 .vsix 文件
   - VSCode Marketplace 发布
   - GitHub Releases 备用分发

### 监控和诊断
1. **日志系统**
   - VSCode Output Channel
   - 分级日志 (Debug/Info/Warn/Error)
   - 性能指标记录

2. **错误处理**
   - 全局错误捕获
   - 用户友好的错误提示
   - 自动错误报告 (可选)

## 源技术栈分析 (IDEA 插件)

### 现有技术栈
- **语言**: Kotlin + Java
- **平台**: IntelliJ Platform SDK
- **构建**: Gradle + Kotlin DSL
- **核心API**: PSI (Program Structure Interface)

### 技术迁移映射
| IDEA 技术 | VSCode 对应技术 | 迁移复杂度 |
|-----------|----------------|------------|
| PSI API | Java AST 解析器 | 高 - 需要重新实现 |
| Kotlin | TypeScript | 中 - 语言特性相似 |
| Gradle | npm + Webpack | 低 - 构建工具差异 |
| 插件描述符 | package.json | 低 - 配置格式不同 |
| 内置索引 | 自建索引系统 | 高 - 完全重新设计 |

### 关键技术挑战
1. **Java 解析复杂度**: 从 PSI 迁移到 JavaScript 生态的 Java 解析
2. **性能要求**: 在 Node.js 环境中达到原生性能
3. **API 差异**: VSCode Extension API 与 IntelliJ Platform API 的差异
4. **调试体验**: 跨语言跨平台的调试复杂度 