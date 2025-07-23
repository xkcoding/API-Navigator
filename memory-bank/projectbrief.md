# 项目概要

## 项目名称
API Navigator

## 项目描述
基于 IntelliJ IDEA 插件的 REST API 导航工具，帮助开发者快速定位和管理 API 端点。

## 技术栈
- **主要语言**: Kotlin
- **构建工具**: Gradle (Kotlin DSL)
- **平台**: IntelliJ IDEA 插件
- **支持框架**: Spring Boot, JAX-RS, Micronaut

## 核心功能
- REST API 端点发现
- 快速导航到 API 映射
- 支持多种注解框架
- 路径参数提取

## 项目结构
- RestfulHelper/ - 主插件模块
  - 注解处理 (annotations/)
  - 贡献者 (contributor/) 
  - 扩展 (extensions/)
  - 模型 (model/)
  - 工具类 (utils/)

## 当前状态
正在进行架构规划阶段 - 将现有 IDEA 插件转换为 VSCode/Cursor 插件

## 转换目标
- **源项目**: RestfulHelper (IntelliJ IDEA 插件)
- **目标项目**: api-navigator (VSCode/Cursor 插件)
- **技术范围**: 第一版仅支持 Java Spring Boot
- **核心功能**: API 端点发现、侧边栏展示、快速搜索、实时更新

## 业务价值
- 扩展用户群体到 VSCode/Cursor 用户
- 简化 Java Spring Boot 开发者的 API 管理流程
- 提供统一的 API 导航体验 