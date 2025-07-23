# 代码风格指南

## Kotlin 代码风格

### 命名约定
- **类名**: PascalCase (如 `RequestMappingItem`)
- **函数名**: camelCase (如 `extractAnnotationValue`)
- **变量名**: camelCase (如 `pathParameter`)
- **常量**: SCREAMING_SNAKE_CASE (如 `DEFAULT_TIMEOUT`)
- **包名**: 小写，点分隔 (如 `com.github.nayacco.restfulhelper`)

### 文件组织
- 每个文件一个公共类
- 相关工具函数可以在同一文件中
- 扩展函数放在 Extensions.kt 中
- 常量放在相应的伴生对象中

### 代码结构
```kotlin
// 1. 包声明
package com.github.nayacco.restfulhelper.model

// 2. 导入声明
import com.intellij.psi.*

// 3. 文档注释
/**
 * 表示 API 路径的数据类
 */
// 4. 类声明
data class Path(
    val segments: List<PathElement>,
    val parameters: List<PathParameter>
)
```

### 注释风格
- 使用 KDoc 格式为公共 API 编写文档
- 复杂逻辑添加行内注释
- TODO 注释格式: `// TODO: 描述待办事项`

## Java 代码风格 (兼容性)

### 基本原则
- 遵循 Google Java Style Guide
- 使用 4 空格缩进
- 每行最大 120 字符
- 使用 UTF-8 编码

## 项目特定约定

### 注解处理
- 注解提取器以 `Extractor` 结尾
- 访问者类以 `Visitor` 结尾
- 映射注解类以 `MappingAnnotation` 结尾

### 测试约定
- 测试类以 `Test` 结尾
- 测试方法使用 `should_` 前缀
- 使用描述性的测试名称

### 错误处理
- 使用 Kotlin 的 `Result` 类型处理可能失败的操作
- 记录重要的错误信息
- 避免吞没异常

## IDE 配置
- 使用项目的 .editorconfig 文件
- 启用代码格式化自动保存
- 配置 import 优化 