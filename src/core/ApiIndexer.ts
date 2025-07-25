import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { ApiEndpoint, HttpMethod } from './types';
import { WorkerPool } from './WorkerPool';
import { JavaASTParser } from './JavaASTParser';

export class ApiIndexer {
    private endpoints: Map<string, ApiEndpoint> = new Map();
    private pathIndex: Map<string, Set<string>> = new Map();
    private classIndex: Map<string, Set<string>> = new Map();
    private fileWatcher?: vscode.FileSystemWatcher;
    private debounceMap = new Map<string, NodeJS.Timeout>();
    private ignoreInstance?: ReturnType<typeof ignore>;

    private _onDidChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

    constructor(private workerPool: WorkerPool) {}

    /**
     * 初始化索引器
     */
    public async initialize(): Promise<void> {
        console.log('正在初始化 API 索引器...');

        try {
            // 初始化 gitignore 规则
            await this.initializeIgnoreRules();
            
            // 扫描工作区中的 Java 文件
            await this.scanWorkspace();
            
            // 设置文件监控
            this.setupFileWatcher();
            
            console.log(`API 索引器初始化完成，共找到 ${this.endpoints.size} 个端点`);
            
            // 触发初始化完成事件
            this._onDidChange.fire();
        } catch (error) {
            console.error('API 索引器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 初始化 gitignore 规则
     */
    private async initializeIgnoreRules(): Promise<void> {
        this.ignoreInstance = ignore();
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.log('未找到工作区，使用默认忽略规则');
            this.setupDefaultIgnoreRules();
            return;
        }

        try {
            // 查找所有 .gitignore 文件
            const gitignoreFiles = await vscode.workspace.findFiles('**/.gitignore', null, 10);
            
            if (gitignoreFiles.length === 0) {
                console.log('未找到 .gitignore 文件，使用默认忽略规则');
                this.setupDefaultIgnoreRules();
                return;
            }

            console.log(`📝 找到 ${gitignoreFiles.length} 个 .gitignore 文件`);
            
            // 读取并合并所有 .gitignore 文件的规则
            for (const gitignoreFile of gitignoreFiles) {
                try {
                    const content = fs.readFileSync(gitignoreFile.fsPath, 'utf-8');
                    this.ignoreInstance.add(content);
                    console.log(`✅ 加载 .gitignore: ${gitignoreFile.fsPath}`);
                } catch (error) {
                    console.warn(`⚠️ 读取 .gitignore 失败: ${gitignoreFile.fsPath}`, error);
                }
            }
            
            // 添加额外的默认规则（确保基础隐藏目录被排除）
            this.addDefaultIgnoreRules();
            
        } catch (error) {
            console.error('初始化 gitignore 规则失败:', error);
            this.setupDefaultIgnoreRules();
        }
    }

    /**
     * 设置默认忽略规则（当没有.gitignore时）
     */
    private setupDefaultIgnoreRules(): void {
        const defaultRules = [
            // 版本控制系统
            '.git/',
            '.svn/',
            '.hg/',
            
            // IDE和编辑器
            '.vscode/',
            '.idea/',
            '.eclipse/',
            '.cursor/',
            '.history/',
            '.specstory/',
            
            // 系统文件
            '.DS_Store',
            'Thumbs.db',
            
            // 构建输出
            'target/',
            'build/',
            'out/',
            'dist/',
            'bin/',
            'classes/',
            
            // 依赖
            'node_modules/',
            '.npm/',
            '.yarn/',
            
            // 日志和临时文件
            'logs/',
            'temp/',
            'tmp/',
            '*.log',
            '*.tmp',
            
            // Java 特定
            '*.class',
            '.gradle/',
            '.mvn/',
        ];
        
        this.ignoreInstance!.add(defaultRules);
        console.log('✅ 应用默认忽略规则');
    }

    /**
     * 添加额外的默认规则（补充.gitignore）
     */
    private addDefaultIgnoreRules(): void {
        const additionalRules = [
            // 确保常见隐藏目录被排除
            '.history/',
            '.cursor/',
            '.specstory/',
            
            // 确保构建目录被排除
            'out/',
            'dist/',
            'temp/',
        ];
        
        this.ignoreInstance!.add(additionalRules);
        console.log('✅ 添加补充忽略规则');
    }

    /**
     * 扫描工作区
     */
    private async scanWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.warn('未找到工作区文件夹');
            return;
        }

        const javaFiles: string[] = [];

        for (const folder of workspaceFolders) {
            const files = await this.findJavaFiles(folder.uri.fsPath);
            javaFiles.push(...files);
        }

        console.log(`找到 ${javaFiles.length} 个 Java 文件`);

        if (javaFiles.length === 0) {
            return;
        }

        // 使用工作线程池批量解析文件
        try {
            const endpoints = await this.workerPool.batchParseFiles(javaFiles);
            this.addEndpoints(endpoints);
        } catch (error) {
            console.error('批量解析文件失败:', error);
            // 降级到单线程解析
            await this.fallbackScanFiles(javaFiles);
        }
    }

    /**
     * 降级到单线程解析（当 Worker 池失败时）
     */
    private async fallbackScanFiles(javaFiles: string[]): Promise<void> {
        console.log('降级到单线程解析模式...');

        for (const filePath of javaFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const endpoints = await JavaASTParser.parseFile(filePath, content);
                this.addEndpoints(endpoints);
            } catch (error) {
                console.error(`单线程解析文件失败: ${filePath}`, error);
            }
        }
    }

    /**
     * 查找 Java 文件 - 使用基础排除 + gitignore验证
     */
    public async findJavaFiles(rootPath: string): Promise<string[]> {
        const javaFiles: string[] = [];
        
        try {
            // 使用基础排除模式，主要依靠 gitignore 进行精确过滤
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(rootPath, '**/*.java'),
                new vscode.RelativePattern(rootPath, '{**/node_modules/**,**/target/**,**/build/**}')
            );

            console.log(`🔍 findFiles发现 ${files.length} 个Java文件`);

            const workspaceRoot = rootPath;
            const filteredFiles: string[] = [];
            
            for (const file of files) {
                // 使用 gitignore 规则验证文件
                if (!this.shouldExcludeFile(file.fsPath, workspaceRoot)) {
                    filteredFiles.push(file.fsPath);
                    console.log(`✅ 包含文件: ${file.fsPath}`);
                } else {
                    console.log(`🚫 gitignore过滤: ${file.fsPath}`);
                }
            }

            javaFiles.push(...filteredFiles);
        } catch (error) {
            console.error('查找 Java 文件失败:', error);
        }

        console.log(`📊 最终包含 ${javaFiles.length} 个Java文件用于扫描`);
        return javaFiles;
    }

    /**
     * 检查是否应该排除文件 - 使用 gitignore 策略
     */
    private shouldExcludeFile(filePath: string, workspaceRoot?: string): boolean {
        if (!this.ignoreInstance) {
            return false;
        }

        try {
            // 计算相对于工作区根目录的路径
            let relativePath = filePath;
            if (workspaceRoot) {
                relativePath = path.relative(workspaceRoot, filePath);
                // 确保使用正斜杠（gitignore 标准）
                relativePath = relativePath.replace(/\\/g, '/');
            }

            // 使用 gitignore 规则检查
            const shouldIgnore = this.ignoreInstance.ignores(relativePath);
            
            if (shouldIgnore) {
                console.log(`🚫 gitignore规则排除: ${relativePath}`);
            }
            
            return shouldIgnore;
        } catch (error) {
            console.error(`检查文件排除规则失败: ${filePath}`, error);
            // 发生错误时，使用保守策略：不排除
            return false;
        }
    }

    /**
     * 添加端点到索引
     */
    private addEndpoints(endpoints: ApiEndpoint[]): void {
        for (const endpoint of endpoints) {
            this.addEndpoint(endpoint);
        }
    }

    /**
     * 添加单个端点
     */
    public addEndpoint(endpoint: ApiEndpoint): void {
        this.endpoints.set(endpoint.id, endpoint);
        this.updateIndices(endpoint);
    }

    /**
     * 更新索引
     */
    private updateIndices(endpoint: ApiEndpoint): void {
        // 更新路径索引
        const pathKey = endpoint.path.toLowerCase();
        if (!this.pathIndex.has(pathKey)) {
            this.pathIndex.set(pathKey, new Set());
        }
        this.pathIndex.get(pathKey)!.add(endpoint.id);

        // 更新类索引
        const classKey = endpoint.controllerClass.toLowerCase();
        if (!this.classIndex.has(classKey)) {
            this.classIndex.set(classKey, new Set());
        }
        this.classIndex.get(classKey)!.add(endpoint.id);
    }

    /**
     * 移除端点
     */
    public removeEndpoint(endpointId: string): void {
        const endpoint = this.endpoints.get(endpointId);
        if (!endpoint) return;

        this.endpoints.delete(endpointId);
        this.removeFromIndices(endpoint);
    }

    /**
     * 从索引中移除
     */
    private removeFromIndices(endpoint: ApiEndpoint): void {
        // 从路径索引中移除
        const pathKey = endpoint.path.toLowerCase();
        const pathSet = this.pathIndex.get(pathKey);
        if (pathSet) {
            pathSet.delete(endpoint.id);
            if (pathSet.size === 0) {
                this.pathIndex.delete(pathKey);
            }
        }

        // 从类索引中移除
        const classKey = endpoint.controllerClass.toLowerCase();
        const classSet = this.classIndex.get(classKey);
        if (classSet) {
            classSet.delete(endpoint.id);
            if (classSet.size === 0) {
                this.classIndex.delete(classKey);
            }
        }
    }

    /**
     * 搜索 API 端点
     */
    public searchEndpoints(query: string): ApiEndpoint[] {
        if (!query.trim()) {
            return this.getAllEndpoints();
        }

        const lowerQuery = query.toLowerCase();
        const results: ApiEndpoint[] = [];

        for (const endpoint of this.endpoints.values()) {
            // 搜索路径
            if (endpoint.path.toLowerCase().includes(lowerQuery)) {
                results.push(endpoint);
                continue;
            }

            // 搜索控制器类名
            if (endpoint.controllerClass.toLowerCase().includes(lowerQuery)) {
                results.push(endpoint);
                continue;
            }

            // 搜索方法名
            if (endpoint.methodName.toLowerCase().includes(lowerQuery)) {
                results.push(endpoint);
                continue;
            }

            // 搜索 HTTP 方法
            if (endpoint.method.toLowerCase().includes(lowerQuery)) {
                results.push(endpoint);
                continue;
            }
        }

        return this.sortEndpoints(results);
    }

    /**
     * 按 HTTP 方法过滤
     */
    public findByMethod(method: HttpMethod): ApiEndpoint[] {
        const filtered = Array.from(this.endpoints.values())
            .filter(endpoint => endpoint.method === method);
        return this.sortEndpoints(filtered);
    }

    /**
     * 按控制器类过滤
     */
    public findByController(controllerClass: string): ApiEndpoint[] {
        const classKey = controllerClass.toLowerCase();
        const endpointIds = this.classIndex.get(classKey);
        
        if (!endpointIds) {
            return [];
        }

        const results: ApiEndpoint[] = [];
        for (const id of endpointIds) {
            const endpoint = this.endpoints.get(id);
            if (endpoint) {
                results.push(endpoint);
            }
        }

        return this.sortEndpoints(results);
    }

    /**
     * 获取所有端点
     */
    public getAllEndpoints(): ApiEndpoint[] {
        return this.sortEndpoints(Array.from(this.endpoints.values()));
    }

    /**
     * 排序端点 - 按控制器名，然后按HTTP方法，最后按路径
     */
    private sortEndpoints(endpoints: ApiEndpoint[]): ApiEndpoint[] {
        return endpoints.sort((a, b) => {
            // 1. 按控制器类名排序
            const controllerA = a.controllerClass.toLowerCase();
            const controllerB = b.controllerClass.toLowerCase();
            if (controllerA !== controllerB) {
                return controllerA.localeCompare(controllerB);
            }

            // 2. 按HTTP方法排序 (GET < POST < PUT < DELETE < PATCH)
            const methodOrder = { 'GET': 1, 'POST': 2, 'PUT': 3, 'DELETE': 4, 'PATCH': 5 };
            const orderA = methodOrder[a.method as keyof typeof methodOrder] || 999;
            const orderB = methodOrder[b.method as keyof typeof methodOrder] || 999;
            if (orderA !== orderB) {
                return orderA - orderB;
            }

            // 3. 按路径排序
            return a.path.localeCompare(b.path);
        });
    }

    /**
     * 获取所有控制器类名
     */
    public getAllControllerClasses(): string[] {
        const classes = new Set<string>();
        for (const endpoint of this.endpoints.values()) {
            classes.add(endpoint.controllerClass);
        }
        return Array.from(classes).sort();
    }

    /**
     * 设置文件监控 - 使用 gitignore 策略
     */
    private setupFileWatcher(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            '**/*.java',
            false, // 不忽略创建
            false, // 不忽略修改
            false  // 不忽略删除
        );

        // 获取工作区根目录
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        this.fileWatcher.onDidCreate(uri => {
            // 使用 gitignore 规则检查文件
            if (!this.shouldExcludeFile(uri.fsPath, workspaceRoot)) {
                console.log(`📁 检测到新Java文件: ${uri.fsPath}`);
                this.debouncedUpdate(uri.fsPath, 'create');
            } else {
                console.log(`🚫 gitignore忽略新文件: ${uri.fsPath}`);
            }
        });

        this.fileWatcher.onDidChange(uri => {
            // 使用 gitignore 规则检查文件
            if (!this.shouldExcludeFile(uri.fsPath, workspaceRoot)) {
                console.log(`📝 检测到Java文件变更: ${uri.fsPath}`);
                this.debouncedUpdate(uri.fsPath, 'change');
            } else {
                console.log(`🚫 gitignore忽略文件变更: ${uri.fsPath}`);
            }
        });

        this.fileWatcher.onDidDelete(uri => {
            // 删除操作总是处理，确保清理
            console.log(`🗑️ 检测到Java文件删除: ${uri.fsPath}`);
            this.debouncedUpdate(uri.fsPath, 'delete');
        });
    }

    /**
     * 防抖更新文件
     */
    private debouncedUpdate(filePath: string, type: string): void {
        const existing = this.debounceMap.get(filePath);
        if (existing) {
            clearTimeout(existing);
        }

        const timeout = setTimeout(() => {
            this.updateFile(filePath, type);
            this.debounceMap.delete(filePath);
        }, 300); // 300ms 防抖

        this.debounceMap.set(filePath, timeout);
    }

    /**
     * 更新文件
     */
    private async updateFile(filePath: string, type: string): Promise<void> {
        try {
            if (type === 'delete') {
                // 删除文件相关的所有端点
                this.removeEndpointsByFile(filePath);
                return;
            }

            // 解析文件
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const endpoints = await JavaASTParser.parseFile(filePath, content);
                
                // 先删除该文件的旧端点
                this.removeEndpointsByFile(filePath);
                
                // 添加新端点
                this.addEndpoints(endpoints);
                
                console.log(`文件更新: ${filePath}, 找到 ${endpoints.length} 个端点`);
            }
        } catch (error) {
            console.error(`更新文件失败: ${filePath}`, error);
        }
    }

    /**
     * 删除文件相关的所有端点
     */
    private removeEndpointsByFile(filePath: string): number {
        const endpointsToRemove = Array.from(this.endpoints.values())
            .filter(endpoint => endpoint.location.filePath === filePath);

        for (const endpoint of endpointsToRemove) {
            this.removeEndpoint(endpoint.id);
        }
        
        // 如果删除了端点，触发更新事件
        if (endpointsToRemove.length > 0) {
            this._onDidChange.fire();
        }
        
        return endpointsToRemove.length;
    }

    /**
     * 刷新索引
     */
    public async refresh(): Promise<void> {
        console.log('刷新 API 索引...');
        
        // 清空现有索引
        this.endpoints.clear();
        this.pathIndex.clear();
        this.classIndex.clear();

        // 重新扫描
        await this.scanWorkspace();
        
        // 触发更新事件
        this._onDidChange.fire();
    }

    /**
     * 销毁索引器
     */
    public dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }

        // 清理防抖定时器
        for (const timeout of this.debounceMap.values()) {
            clearTimeout(timeout);
        }
        this.debounceMap.clear();
    }

    /**
     * 获取统计信息
     */
    public getStatistics(): {
        totalEndpoints: number;
        controllerCount: number;
        methodCounts: Record<HttpMethod, number>;
    } {
        const methodCounts: Record<HttpMethod, number> = {
            GET: 0,
            POST: 0,
            PUT: 0,
            DELETE: 0,
            PATCH: 0
        };

        for (const endpoint of this.endpoints.values()) {
            methodCounts[endpoint.method]++;
        }

        return {
            totalEndpoints: this.endpoints.size,
            controllerCount: this.getAllControllerClasses().length,
            methodCounts
        };
    }

    // ==================== PERSISTENT CACHE SUPPORT ====================

    /**
     * 从缓存数据初始化索引器
     * 用于快速启动，避免重新扫描所有文件
     */
    public async initializeFromCache(cacheData: import('./types').CacheData): Promise<void> {
        console.log(`正在从缓存初始化 API 索引器: ${cacheData.endpoints.length} 个端点`);

        try {
            // 清空现有数据
            this.endpoints.clear();
            this.pathIndex.clear();
            this.classIndex.clear();

            // 加载缓存的端点数据
            for (const endpoint of cacheData.endpoints) {
                this.endpoints.set(endpoint.id, endpoint);
            }

            // 重建索引
            this.rebuildIndices();

            // 初始化 gitignore 规则（如果还没有初始化）
            if (!this.ignoreInstance) {
                await this.initializeIgnoreRules();
            }

            // 设置文件监控
            this.setupFileWatcher();

            console.log(`从缓存初始化完成，共加载 ${this.endpoints.size} 个端点`);

            // 触发变更事件
            this._onDidChange.fire();

        } catch (error) {
            console.error('从缓存初始化失败:', error);
            throw error;
        }
    }

    /**
     * 增量更新指定文件
     * 只解析变更的文件，提高性能
     */
    public async updateFiles(filePaths: string[]): Promise<void> {
        if (filePaths.length === 0) {
            return;
        }

        console.log(`正在增量更新 ${filePaths.length} 个文件...`);

        try {
            // 使用工作线程池批量解析文件
            const newEndpoints = await this.workerPool.batchParseFiles(filePaths);
            
            // 先删除这些文件的旧端点
            for (const filePath of filePaths) {
                this.removeEndpointsByFile(filePath);
            }

            // 添加新解析的端点
            this.addEndpoints(newEndpoints);

            console.log(`增量更新完成，处理了 ${filePaths.length} 个文件，新增/更新 ${newEndpoints.length} 个端点`);

            // 触发变更事件
            this._onDidChange.fire();

        } catch (error) {
            console.error('增量更新失败，回退到单线程模式:', error);
            
            // 降级到单线程解析
            for (const filePath of filePaths) {
                await this.updateFile(filePath, 'change');
            }
        }
    }

    /**
     * 删除指定文件的所有端点
     * 用于处理文件删除
     */
    public removeFileEndpoints(filePath: string): void {
        console.log(`正在删除文件端点: ${filePath}`);
        
        const removedCount = this.removeEndpointsByFile(filePath);
        
        if (removedCount > 0) {
            console.log(`已删除 ${removedCount} 个端点`);
            this._onDidChange.fire();
        }
    }

    /**
     * 重建路径和类索引
     * 在从缓存加载后调用
     */
    private rebuildIndices(): void {
        this.pathIndex.clear();
        this.classIndex.clear();

        for (const endpoint of this.endpoints.values()) {
            // 重建路径索引
            const pathParts = endpoint.path.toLowerCase().split('/').filter(part => part.length > 0);
            for (const part of pathParts) {
                if (!this.pathIndex.has(part)) {
                    this.pathIndex.set(part, new Set());
                }
                this.pathIndex.get(part)!.add(endpoint.id);
            }

            // 重建类索引
            const className = endpoint.controllerClass.toLowerCase();
            const classNameParts = className.split('.').concat(className.split(/(?=[A-Z])/));
            
            for (const part of classNameParts) {
                if (part.length > 0) {
                    if (!this.classIndex.has(part)) {
                        this.classIndex.set(part, new Set());
                    }
                    this.classIndex.get(part)!.add(endpoint.id);
                }
            }
        }

        console.log(`索引重建完成: 路径索引 ${this.pathIndex.size} 项, 类索引 ${this.classIndex.size} 项`);
    }

    /**
     * 获取文件相关的端点数量（用于统计）
     */
    public getFileEndpointCount(filePath: string): number {
        let count = 0;
        for (const endpoint of this.endpoints.values()) {
            if (endpoint.location.filePath === filePath) {
                count++;
            }
        }
        return count;
    }

    /**
     * 获取所有文件路径（用于变更检测）
     */
    public getAllFilePaths(): string[] {
        const filePaths = new Set<string>();
        for (const endpoint of this.endpoints.values()) {
            filePaths.add(endpoint.location.filePath);
        }
        return Array.from(filePaths);
    }

    /**
     * 检查索引器是否为空
     */
    public isEmpty(): boolean {
        return this.endpoints.size === 0;
    }

    /**
     * 获取缓存相关统计信息
     */
    public getCacheStatistics(): {
        endpointCount: number;
        fileCount: number;
        controllerCount: number;
        avgEndpointsPerFile: number;
    } {
        const fileCount = this.getAllFilePaths().length;
        const controllerCount = this.getAllControllerClasses().length;
        
        return {
            endpointCount: this.endpoints.size,
            fileCount,
            controllerCount,
            avgEndpointsPerFile: fileCount > 0 ? Math.round(this.endpoints.size / fileCount * 100) / 100 : 0
        };
    }
} 