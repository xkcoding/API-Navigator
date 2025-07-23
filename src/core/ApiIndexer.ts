import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint, HttpMethod } from './types';
import { WorkerPool } from './WorkerPool';
import { JavaASTParser } from './JavaASTParser';

export class ApiIndexer {
    private endpoints: Map<string, ApiEndpoint> = new Map();
    private pathIndex: Map<string, Set<string>> = new Map();
    private classIndex: Map<string, Set<string>> = new Map();
    private fileWatcher?: vscode.FileSystemWatcher;
    private debounceMap = new Map<string, NodeJS.Timeout>();

    private _onDidChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

    constructor(private workerPool: WorkerPool) {}

    /**
     * 初始化索引器
     */
    public async initialize(): Promise<void> {
        console.log('正在初始化 API 索引器...');

        try {
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
     * 查找 Java 文件
     */
    private async findJavaFiles(rootPath: string): Promise<string[]> {
        const javaFiles: string[] = [];
        
        try {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(rootPath, '**/*.java'),
                new vscode.RelativePattern(rootPath, '{**/node_modules/**,**/target/**,**/build/**,**/.git/**}')
            );

            for (const file of files) {
                javaFiles.push(file.fsPath);
            }
        } catch (error) {
            console.error('查找 Java 文件失败:', error);
        }

        return javaFiles;
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

        return results;
    }

    /**
     * 按 HTTP 方法过滤
     */
    public findByMethod(method: HttpMethod): ApiEndpoint[] {
        return Array.from(this.endpoints.values())
            .filter(endpoint => endpoint.method === method);
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

        return results;
    }

    /**
     * 获取所有端点
     */
    public getAllEndpoints(): ApiEndpoint[] {
        return Array.from(this.endpoints.values());
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
     * 设置文件监控
     */
    private setupFileWatcher(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            '**/*.java',
            false, // 不忽略创建
            false, // 不忽略修改
            false  // 不忽略删除
        );

        this.fileWatcher.onDidCreate(uri => {
            this.debouncedUpdate(uri.fsPath, 'create');
        });

        this.fileWatcher.onDidChange(uri => {
            this.debouncedUpdate(uri.fsPath, 'change');
        });

        this.fileWatcher.onDidDelete(uri => {
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
    private removeEndpointsByFile(filePath: string): void {
        const endpointsToRemove = Array.from(this.endpoints.values())
            .filter(endpoint => endpoint.location.filePath === filePath);

        for (const endpoint of endpointsToRemove) {
            this.removeEndpoint(endpoint.id);
        }
        
        // 如果删除了端点，触发更新事件
        if (endpointsToRemove.length > 0) {
            this._onDidChange.fire();
        }
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
} 