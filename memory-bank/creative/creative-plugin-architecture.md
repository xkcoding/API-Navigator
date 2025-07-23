# 创意阶段：API Navigator 插件架构设计

## 1️⃣ 问题定义与需求分析

### 核心挑战
将现有的 RestfulHelper IDEA 插件（基于 IntelliJ Platform SDK 和 PSI API）完全重新架构，转换为基于 VSCode Extension API 的 api-navigator 插件，实现相同的核心功能。

### 技术转换映射表
| IDEA 技术栈 | VSCode 对应技术 | 转换复杂度 |
|------------|----------------|-----------|
| PSI API (Java解析) | Java AST 解析器 | **高** - 核心技术重构 |
| Kotlin 语言 | TypeScript | **中** - 语言特性差异 |
| IntelliJ Platform API | VSCode Extension API | **高** - 完全不同的API体系 |
| 内置索引系统 | 自建索引 + 文件监控 | **高** - 从零实现 |
| 插件配置描述符 | package.json + manifest | **低** - 配置格式转换 |

### 核心功能需求
1. **侧边栏树视图**: 显示所有 REST API 端点，包含 HTTP 方法标识
2. **快捷键搜索**: CMD+\ 或 CMD+SHIFT+P 快速查找接口
3. **代码导航**: 点击端点直接跳转到对应的控制器方法
4. **实时同步**: 文件变更时自动更新 API 端点索引
5. **Spring Boot 支持**: 第一版仅支持 Spring Boot 注解体系

### 性能要求
- **启动时间**: < 3秒完成项目扫描
- **搜索响应**: < 200ms 返回搜索结果
- **内存使用**: < 100MB 内存占用
- **文件监控**: < 500ms 响应文件变更

---

## 2️⃣ 架构方案选项

### 方案 A: 单线程同步架构
```typescript
// 主线程处理所有任务
class ApiNavigatorPlugin {
  private parser: JavaParser
  private indexer: ApiIndexer
  private treeView: TreeViewProvider
  
  async activate() {
    // 同步扫描所有文件
    await this.scanWorkspace()
    this.setupFileWatcher()
  }
  
  private async scanWorkspace() {
    const javaFiles = await this.findJavaFiles()
    for (const file of javaFiles) {
      const ast = this.parser.parse(file)
      this.indexer.extractEndpoints(ast)
    }
  }
}
```

**优点:**
- 实现简单，开发快速
- 调试容易，错误处理直观
- 内存管理简单

**缺点:**
- 大项目扫描时阻塞 UI
- 性能瓶颈明显
- 无法满足性能要求

**技术评估:** 🔴 不推荐

---

### 方案 B: Worker Threads 异步架构
```typescript
// 主线程
class ApiNavigatorPlugin {
  private workerPool: WorkerThreadPool
  private indexer: ConcurrentIndexer
  
  async activate() {
    this.workerPool = new WorkerThreadPool(4)
    await this.scanWorkspaceAsync()
  }
  
  private async scanWorkspaceAsync() {
    const javaFiles = await this.findJavaFiles()
    const chunks = this.chunkFiles(javaFiles, 10)
    
    const promises = chunks.map(chunk =>
      this.workerPool.execute('parseFiles', chunk)
    )
    
    const results = await Promise.all(promises)
    this.indexer.mergeResults(results)
  }
}

// worker.ts
import { parentPort } from 'worker_threads'
import { JavaASTParser } from './parser'

parentPort.on('message', async ({ type, data }) => {
  if (type === 'parseFiles') {
    const endpoints = []
    for (const filePath of data) {
      const ast = JavaASTParser.parseFile(filePath)
      endpoints.push(...extractSpringEndpoints(ast))
    }
    parentPort.postMessage({ type: 'result', data: endpoints })
  }
})
```

**优点:**
- 非阻塞主线程，UI 响应流畅
- 支持并行处理，性能优秀
- 可扩展的工作线程池
- 支持大型项目

**缺点:**
- 架构复杂度较高
- Worker 通信开销
- 调试和错误处理复杂

**技术评估:** 🟢 强烈推荐

---

### 方案 C: 增量解析 + 缓存架构
```typescript
class IncrementalApiIndexer {
  private cache: Map<string, {
    lastModified: number
    endpoints: ApiEndpoint[]
    dependencies: Set<string>
  }> = new Map()
  
  async updateFile(filePath: string) {
    const stat = await fs.stat(filePath)
    const cached = this.cache.get(filePath)
    
    if (cached && cached.lastModified >= stat.mtime.getTime()) {
      return cached.endpoints // 使用缓存
    }
    
    // 增量解析
    const ast = await this.parseFile(filePath)
    const endpoints = this.extractEndpoints(ast)
    
    this.cache.set(filePath, {
      lastModified: stat.mtime.getTime(),
      endpoints,
      dependencies: this.extractDependencies(ast)
    })
    
    // 更新依赖的文件
    await this.updateDependentFiles(filePath)
    return endpoints
  }
}
```

**优点:**
- 极高的更新性能
- 智能缓存机制
- 支持依赖关系追踪
- 内存效率高

**缺点:**
- 缓存一致性复杂
- 依赖分析困难
- 初次扫描仍然较慢

**技术评估:** 🟡 作为优化策略

---

### 方案 D: 混合架构（推荐）
```typescript
class HybridApiNavigator {
  private workerPool: WorkerThreadPool
  private incrementalIndexer: IncrementalIndexer
  private persistentCache: PersistentCache
  
  async activate() {
    // 1. 启动工作线程池
    this.workerPool = new WorkerThreadPool(4)
    
    // 2. 加载持久化缓存
    await this.persistentCache.load()
    
    // 3. 增量扫描变更的文件
    const changedFiles = await this.detectChangedFiles()
    
    if (changedFiles.length > 50) {
      // 大量变更：使用 Worker 池全量扫描
      await this.fullScanWithWorkers()
    } else {
      // 少量变更：增量更新
      await this.incrementalUpdate(changedFiles)
    }
    
    // 4. 设置文件监控
    this.setupIncrementalFileWatcher()
  }
  
  private async fullScanWithWorkers() {
    const javaFiles = await this.findJavaFiles()
    const chunks = this.chunkFiles(javaFiles, 20)
    
    const results = await Promise.all(
      chunks.map(chunk =>
        this.workerPool.execute('batchParse', chunk)
      )
    )
    
    this.indexer.mergeResults(results)
    await this.persistentCache.save()
  }
  
  private async incrementalUpdate(files: string[]) {
    for (const file of files) {
      const result = await this.incrementalIndexer.updateFile(file)
      this.treeView.updateNode(file, result)
    }
  }
}
```

**优点:**
- 结合所有方案的优势
- 自适应性能策略
- 持久化缓存减少重复工作
- 优秀的用户体验

**缺点:**
- 架构复杂度最高
- 开发和测试工作量大
- 多种策略的协调管理

**技术评估:** 🟢 最佳方案

---

## 3️⃣ 核心组件设计

### Spring Boot 注解组合逻辑 ⭐

#### 关键实现细节
Spring Boot API 端点的完整路径由**两层注解组合**而成：

```java
@RestController
@RequestMapping("/api/users")    // 类级别基础路径
public class UserController {
    
    @GetMapping("/{id}")         // 方法级别路径
    public User getUser(@PathVariable Long id) {
        // 最终路径: GET /api/users/{id}
    }
    
    @PostMapping("/register")    // 方法级别路径  
    public User createUser(@RequestBody User user) {
        // 最终路径: POST /api/users/register
    }
    
    @RequestMapping(value = "/search", method = RequestMethod.GET)
    public List<User> searchUsers(@RequestParam String query) {
        // 最终路径: GET /api/users/search
    }
}
```

#### 路径组合规则
```typescript
class SpringUrlComposer {
  composeFullPath(classMapping: string, methodMapping: string): string {
    // 1. 清理和标准化路径
    const cleanClassPath = this.cleanPath(classMapping)
    const cleanMethodPath = this.cleanPath(methodMapping)
    
    // 2. 组合路径
    if (!cleanClassPath) return cleanMethodPath || '/'
    if (!cleanMethodPath) return cleanClassPath
    
    // 3. 避免重复的斜杠
    const basePath = cleanClassPath.endsWith('/') 
      ? cleanClassPath.slice(0, -1) 
      : cleanClassPath
    const methodPath = cleanMethodPath.startsWith('/') 
      ? cleanMethodPath 
      : '/' + cleanMethodPath
    
    return basePath + methodPath
  }
  
  private cleanPath(path: string): string {
    if (!path) return ''
    // 去除引号，处理变量替换
    return path.replace(/['"]/g, '').replace(/\$\{([^}]+)\}/g, '{$1}')
  }
}
```

### Java AST 解析器设计（更新）

#### 完整的注解解析流程
```typescript
class SpringAnnotationParser {
  parseController(classNode: ClassNode): ControllerInfo {
    const controllerInfo: ControllerInfo = {
      className: classNode.name,
      classLevelMapping: this.extractClassMapping(classNode),
      methods: []
    }
    
    // 解析每个方法
    for (const method of classNode.methods) {
      const methodInfo = this.parseMethod(method, controllerInfo.classLevelMapping)
      if (methodInfo) {
        controllerInfo.methods.push(methodInfo)
      }
    }
    
    return controllerInfo
  }
  
  private extractClassMapping(classNode: ClassNode): string {
    // 查找类级别的 @RequestMapping
    const requestMappingAnnotation = classNode.annotations.find(
      ann => ann.name === 'RequestMapping'
    )
    
    if (requestMappingAnnotation) {
      // 提取 value 或 path 属性
      return this.extractMappingValue(requestMappingAnnotation) || ''
    }
    
    return '' // 没有类级别映射
  }
  
  private parseMethod(methodNode: MethodNode, classMapping: string): ApiEndpoint | null {
    // 检查是否有映射注解
    const mappingAnnotation = this.findMappingAnnotation(methodNode)
    if (!mappingAnnotation) return null
    
    const methodMapping = this.extractMappingValue(mappingAnnotation)
    const httpMethod = this.extractHttpMethod(mappingAnnotation)
    
    // 组合完整路径
    const fullPath = this.urlComposer.composeFullPath(classMapping, methodMapping)
    
    return {
      id: `${methodNode.name}_${Date.now()}`,
      method: httpMethod,
      path: fullPath,
      controllerClass: classNode.name,
      methodName: methodNode.name,
      parameters: this.extractParameters(methodNode),
      location: this.extractLocation(methodNode),
      annotations: [mappingAnnotation]
    }
  }
  
  private findMappingAnnotation(methodNode: MethodNode): Annotation | null {
    const mappingAnnotations = [
      'GetMapping', 'PostMapping', 'PutMapping', 
      'DeleteMapping', 'PatchMapping', 'RequestMapping'
    ]
    
    return methodNode.annotations.find(ann => 
      mappingAnnotations.includes(ann.name)
    ) || null
  }
  
  private extractHttpMethod(annotation: Annotation): HttpMethod {
    switch (annotation.name) {
      case 'GetMapping': return 'GET'
      case 'PostMapping': return 'POST'
      case 'PutMapping': return 'PUT'
      case 'DeleteMapping': return 'DELETE'
      case 'PatchMapping': return 'PATCH'
      case 'RequestMapping':
        // 从 method 属性中提取
        const methodValue = annotation.attributes?.method
        if (methodValue) {
          return this.parseRequestMethod(methodValue)
        }
        return 'GET' // 默认值
      default:
        return 'GET'
    }
  }
  
  private parseRequestMethod(methodValue: string): HttpMethod {
    // 处理 RequestMethod.GET 格式
    if (methodValue.includes('RequestMethod.')) {
      return methodValue.split('.')[1] as HttpMethod
    }
    return methodValue.toUpperCase() as HttpMethod
  }
}
```

#### 数据结构更新
```typescript
interface ControllerInfo {
  className: string
  classLevelMapping: string      // 类级别的 @RequestMapping 路径
  methods: ApiEndpoint[]
}

interface ApiEndpoint {
  id: string
  method: HttpMethod
  path: string                   // 完整组合后的路径
  classMapping: string           // 类级别路径部分
  methodMapping: string          // 方法级别路径部分
  controllerClass: string
  methodName: string
  parameters: Parameter[]
  location: CodeLocation
  annotations: Annotation[]
}

// 新增：路径组合信息
interface PathComposition {
  classPath: string              // 来自类级别 @RequestMapping
  methodPath: string             // 来自方法级别映射注解
  fullPath: string               // 组合后的完整路径
  hasClassMapping: boolean       // 是否有类级别映射
  hasMethodMapping: boolean      // 是否有方法级别映射
}
```

### Java AST 解析器选择

#### 选项 1: @babel/parser + Java 语法扩展
```typescript
import * as parser from '@babel/parser'

class BabelJavaParser implements JavaParser {
  parse(content: string): JavaAST {
    // 需要自定义 Java 语法插件
    return parser.parse(content, {
      sourceType: 'module',
      plugins: ['java-syntax'] // 自定义插件
    })
  }
}
```

**评估:** 🔴 不推荐 - Babel 主要为 JavaScript 设计

#### 选项 2: java-ast 库
```typescript
import { parse } from 'java-ast'

class JavaASTParser implements JavaParser {
  parse(content: string): JavaAST {
    return parse(content, {
      tolerateErrors: true,
      includeComments: false
    })
  }
  
  extractAnnotations(node: MethodNode): Annotation[] {
    return node.annotations.filter(ann => 
      SPRING_ANNOTATIONS.includes(ann.name)
    )
  }
}
```

**评估:** 🟢 推荐 - 专门为 Java 设计

#### 选项 3: 基于正则表达式的轻量解析器
```typescript
class RegexJavaParser implements JavaParser {
  private static CONTROLLER_REGEX = /@(RestController|Controller)\s*class\s+(\w+)/g
  private static MAPPING_REGEX = /@(GetMapping|PostMapping|RequestMapping)\s*(?:\("([^"]+)"\))?\s*public\s+\w+\s+(\w+)/g
  
  extractEndpoints(content: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = []
    const controllers = [...content.matchAll(this.CONTROLLER_REGEX)]
    
    for (const controller of controllers) {
      const mappings = [...content.matchAll(this.MAPPING_REGEX)]
      // 解析注解和方法
    }
    
    return endpoints
  }
}
```

**评估:** 🟡 备选方案 - 性能优秀但功能有限

### 决策: 使用 java-ast 作为主要解析器

#### 与原 IDEA 插件的对比
```kotlin
// 原 IDEA 插件的实现方式 (SpringMappingAnnotation.kt)
private fun fetchMappingsFromClass(psiMethod: PsiMethod): List<String> {
    val classMapping = psiMethod
        .containingClass
        ?.modifierList
        ?.annotations
        ?.filterNotNull()
        ?.filter { it.qualifiedName == SPRING_REQUEST_MAPPING_CLASS }
        ?.flatMap { fetchMapping(it) } ?: emptyList()
    return classMapping.ifEmpty { listOf("") }
}

private fun fetchMappingsFromMethod(annotation: PsiAnnotation, method: PsiMethod): List<String> {
    // 获取方法级别的映射
    return fetchMapping(annotation)
        .map { Path(it).addPathVariablesTypes(parametersNameWithType).toFullPath() }
}
```

```typescript
// 我们的新实现方式
class SpringEndpointExtractor {
  extractEndpoints(controllerClass: ClassNode): ApiEndpoint[] {
    const classMapping = this.extractClassMapping(controllerClass) // 类级别 @RequestMapping
    const endpoints: ApiEndpoint[] = []
    
    for (const method of controllerClass.methods) {
      const mappingAnnotation = this.findMappingAnnotation(method)
      if (mappingAnnotation) {
        const methodMapping = this.extractMappingValue(mappingAnnotation)
        const fullPath = this.composeUrl(classMapping, methodMapping)
        
        endpoints.push({
          // ... 其他属性
          path: fullPath,
          classMapping: classMapping,
          methodMapping: methodMapping,
          pathComposition: {
            classPath: classMapping,
            methodPath: methodMapping,
            fullPath: fullPath,
            hasClassMapping: !!classMapping,
            hasMethodMapping: !!methodMapping
          }
        })
      }
    }
    
    return endpoints
  }
}
```

#### 测试用例验证
```typescript
describe('Spring注解组合解析', () => {
  test('类和方法都有映射', () => {
    const javaCode = `
      @RestController
      @RequestMapping("/api/users")
      public class UserController {
          @GetMapping("/{id}")
          public User getUser(@PathVariable Long id) {}
      }
    `
    
    const result = parser.extractEndpoints(javaCode)
    expect(result[0].path).toBe('/api/users/{id}')
    expect(result[0].classMapping).toBe('/api/users')
    expect(result[0].methodMapping).toBe('/{id}')
  })
  
  test('只有方法级别映射', () => {
    const javaCode = `
      @RestController
      public class UserController {
          @GetMapping("/users/{id}")
          public User getUser(@PathVariable Long id) {}
      }
    `
    
    const result = parser.extractEndpoints(javaCode)
    expect(result[0].path).toBe('/users/{id}')
    expect(result[0].classMapping).toBe('')
    expect(result[0].methodMapping).toBe('/users/{id}')
  })
})
```

---

## 4️⃣ 数据模型设计

```typescript
// 核心数据模型
interface ApiEndpoint {
  id: string                    // 唯一标识符
  method: HttpMethod           // GET, POST, PUT, DELETE, PATCH
  path: string                 // 完整API路径，如 /api/users/{id}
  classMapping: string         // 类级别路径部分，如 /api/users
  methodMapping: string        // 方法级别路径部分，如 /{id}
  controllerClass: string      // 控制器类名
  methodName: string           // 方法名
  parameters: Parameter[]      // 参数列表
  location: CodeLocation       // 代码位置信息
  annotations: Annotation[]    // 注解信息
  pathComposition: PathComposition  // 路径组合信息
}

interface CodeLocation {
  filePath: string
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
}

interface Parameter {
  name: string
  type: string
  isPathVariable: boolean
  isRequestParam: boolean
  isRequestBody: boolean
}

// 索引管理
class ApiEndpointIndex {
  private endpoints: Map<string, ApiEndpoint> = new Map()
  private pathIndex: Map<string, Set<string>> = new Map()
  private classIndex: Map<string, Set<string>> = new Map()
  
  addEndpoint(endpoint: ApiEndpoint): void {
    this.endpoints.set(endpoint.id, endpoint)
    this.updateIndices(endpoint)
  }
  
  searchByPath(pattern: string): ApiEndpoint[] {
    // 模糊搜索实现
    return Array.from(this.endpoints.values())
      .filter(ep => ep.path.includes(pattern))
  }
  
  findByMethod(method: HttpMethod): ApiEndpoint[] {
    return Array.from(this.endpoints.values())
      .filter(ep => ep.method === method)
  }
}
```

---

## 5️⃣ UI/UX 设计方案

### 侧边栏树视图设计
```typescript
class ApiTreeViewProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event
  
  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      // 根节点：按控制器分组
      return this.groupByController()
    } else if (element.type === 'controller') {
      // 控制器节点：显示该控制器的所有端点
      return this.getEndpointsByController(element.id)
    }
    return []
  }
  
  getTreeItem(element: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      element.type === 'controller' 
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    )
    
    if (element.type === 'endpoint') {
      item.iconPath = this.getMethodIcon(element.method)
      item.command = {
        command: 'apiNavigator.gotoEndpoint',
        title: 'Go to endpoint',
        arguments: [element.location]
      }
    }
    
    return item
  }
}

// 树节点图标设计
interface TreeNodeIcon {
  GET: 'symbol-method'      // 绿色方法图标
  POST: 'symbol-constructor' // 蓝色构造函数图标
  PUT: 'symbol-property'    // 橙色属性图标
  DELETE: 'symbol-operator' // 红色操作符图标
  PATCH: 'symbol-event'     // 紫色事件图标
}
```

### 搜索面板设计
```typescript
class ApiSearchProvider implements vscode.QuickPickProvider {
  async provideQuickPickItems(
    token: vscode.CancellationToken
  ): Promise<vscode.QuickPickItem[]> {
    const endpoints = await this.indexer.getAllEndpoints()
    
    return endpoints.map(endpoint => ({
      label: `${endpoint.method} ${endpoint.path}`,
      description: `${endpoint.controllerClass}.${endpoint.methodName}`,
      detail: endpoint.location.filePath,
      endpoint: endpoint
    }))
  }
  
  async onDidSelectItem(item: any): Promise<void> {
    if (item.endpoint) {
      await vscode.commands.executeCommand(
        'apiNavigator.gotoEndpoint',
        item.endpoint.location
      )
    }
  }
}
```

---

## 6️⃣ 性能优化策略

### 内存管理
```typescript
class MemoryOptimizedIndexer {
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024 // 50MB
  private cache = new Map<string, WeakRef<ApiEndpoint[]>>()
  
  private cleanupCache(): void {
    for (const [key, weakRef] of this.cache.entries()) {
      if (!weakRef.deref()) {
        this.cache.delete(key)
      }
    }
  }
  
  getEndpoints(filePath: string): ApiEndpoint[] | undefined {
    const weakRef = this.cache.get(filePath)
    return weakRef?.deref()
  }
}
```

### 文件监控优化
```typescript
class OptimizedFileWatcher {
  private debounceMap = new Map<string, NodeJS.Timeout>()
  
  setupWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      '**/*.java',
      false, // 不忽略创建
      false, // 不忽略修改
      false  // 不忽略删除
    )
    
    watcher.onDidChange(uri => {
      this.debouncedUpdate(uri.fsPath, 'change')
    })
  }
  
  private debouncedUpdate(filePath: string, type: string): void {
    const existing = this.debounceMap.get(filePath)
    if (existing) {
      clearTimeout(existing)
    }
    
    const timeout = setTimeout(() => {
      this.updateFile(filePath, type)
      this.debounceMap.delete(filePath)
    }, 300) // 300ms 防抖
    
    this.debounceMap.set(filePath, timeout)
  }
}
```

---

## 7️⃣ 架构决策总结

### 最终选择：混合架构 + java-ast 解析器

**核心决策依据:**
1. **性能要求**: Worker Threads 确保 UI 响应性
2. **扩展性**: 增量更新支持大型项目
3. **可靠性**: java-ast 提供稳定的 Java 解析
4. **用户体验**: 持久化缓存减少重复扫描

### 实施路线图
1. **第一阶段**: 实现基础 Worker Threads 架构
2. **第二阶段**: 添加增量更新和缓存机制
3. **第三阶段**: 优化 UI/UX 和性能调优
4. **第四阶段**: 添加高级搜索和过滤功能

### 技术风险评估
- **高风险**: Java AST 解析的复杂度和性能
- **中风险**: Worker Threads 的稳定性和调试难度
- **低风险**: VSCode API 集成和 UI 开发

### 成功指标
- ✅ 启动时间 < 3秒（1000个文件以内）
- ✅ 搜索响应 < 200ms
- ✅ 内存使用 < 100MB
- ✅ 文件更新延迟 < 500ms

---

## 8️⃣ 下一步行动

1. **立即开始**: 设置 TypeScript + VSCode Extension 开发环境
2. **原型验证**: 创建 java-ast 解析器原型
3. **架构实现**: 实施 Worker Threads 架构
4. **UI 开发**: 实现侧边栏树视图
5. **测试验证**: 在真实 Spring Boot 项目中测试

**准备进入 IMPLEMENT 阶段** 🚀 