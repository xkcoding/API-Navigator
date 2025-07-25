import * as vscode from 'vscode';
import { FileSystemCache } from './FileSystemCache';
import { FileHasher } from './FileHasher';
import { ApiIndexer } from './ApiIndexer';
import { 
    CacheData, 
    CacheStatistics, 
    CacheStatus, 
    RefreshProgress, 
    FileChangeSet,
    ApiEndpoint 
} from './types';

/**
 * 持久化索引管理器
 * 统一管理缓存加载、变更检测、增量更新等核心功能
 */
export class PersistentIndexManager {
    private readonly fileSystemCache: FileSystemCache;
    private readonly fileHasher: FileHasher;
    private workspaceHash: string = '';
    private currentCacheData: CacheData | null = null;
    
    // 事件发射器
    private _onCacheStatusChanged: vscode.EventEmitter<RefreshProgress> = new vscode.EventEmitter<RefreshProgress>();
    public readonly onCacheStatusChanged: vscode.Event<RefreshProgress> = this._onCacheStatusChanged.event;

    // 性能监控
    private performanceMetrics = {
        lastLoadTime: 0,
        lastRefreshTime: 0,
        cacheHitRate: 0
    };

    constructor(
        private apiIndexer: ApiIndexer,
        cacheOptions: Partial<import('./types').CacheOptions> = {}
    ) {
        this.fileSystemCache = new FileSystemCache(cacheOptions);
        this.fileHasher = new FileHasher();
    }

    /**
     * 初始化缓存管理器
     * 尝试从缓存加载数据，如果失败则进行完整索引
     */
    public async initializeWithCache(): Promise<void> {
        console.log('初始化持久化索引管理器...');
        
        try {
            // 生成工作区哈希
            const workspacePath = this.getWorkspacePath();
            if (!workspacePath) {
                console.warn('未找到工作区路径，跳过缓存加载');
                await this.fallbackToFullIndex();
                return;
            }

            this.workspaceHash = this.fileSystemCache.generateWorkspaceHash(workspacePath);
            console.log(`工作区哈希: ${this.workspaceHash}`);

            // 尝试加载缓存
            await this.loadFromCacheWithFallback();

        } catch (error) {
            console.error('缓存初始化失败:', error);
            await this.fallbackToFullIndex();
        }
    }

    /**
     * 尝试从缓存加载，失败时回退到完整索引
     */
    private async loadFromCacheWithFallback(): Promise<void> {
        this.emitStatus(CacheStatus.LOADING, '正在加载缓存数据...');
        
        const startTime = Date.now();
        
        try {
            // 尝试加载缓存数据
            const cachedData = await this.fileSystemCache.loadCache(this.workspaceHash);
            
            if (cachedData) {
                console.log(`缓存加载成功: ${cachedData.endpoints.length} 个端点`);
                
                // 立即应用缓存数据到索引器
                await this.applyCache(cachedData);
                
                this.currentCacheData = cachedData;
                this.performanceMetrics.lastLoadTime = Date.now() - startTime;
                this.performanceMetrics.cacheHitRate = 1;
                
                this.emitStatus(CacheStatus.LOADED, `已加载 ${cachedData.endpoints.length} 个API (${this.performanceMetrics.lastLoadTime}ms)`);
                
                // 异步开始后台刷新检查
                this.startBackgroundRefresh();
            } else {
                console.log('缓存不存在或已过期，进行完整索引');
                await this.fallbackToFullIndex();
            }
            
        } catch (error) {
            console.error('缓存加载失败，回退到完整索引:', error);
            await this.fallbackToFullIndex();
        }
    }

    /**
     * 应用缓存数据到ApiIndexer
     */
    private async applyCache(cacheData: CacheData): Promise<void> {
        // 直接调用ApiIndexer的缓存加载方法（已实现）
        await this.apiIndexer.initializeFromCache(cacheData);
    }

    /**
     * 回退到完整索引
     */
    private async fallbackToFullIndex(): Promise<void> {
        this.emitStatus(CacheStatus.LOADING, '正在进行完整索引...');
        
        const startTime = Date.now();
        
        try {
            // 调用原有的完整索引方法
            await this.apiIndexer.initialize();
            
            this.performanceMetrics.lastLoadTime = Date.now() - startTime;
            this.performanceMetrics.cacheHitRate = 0;
            
            // 完整索引完成后，保存缓存
            await this.saveCurrentStateToCache();
            
            this.emitStatus(CacheStatus.LOADED, `完整索引完成 (${this.performanceMetrics.lastLoadTime}ms)`);
            
        } catch (error) {
            console.error('完整索引失败:', error);
            this.emitStatus(CacheStatus.ERROR, '索引失败');
            throw error;
        }
    }

    /**
     * 开始后台刷新检查
     */
    private async startBackgroundRefresh(): Promise<void> {
        // 短暂延迟后开始后台检查，避免阻塞用户操作
        setTimeout(() => {
            this.detectAndUpdateChanges().catch(error => {
                console.error('后台刷新失败:', error);
            });
        }, 1000);
    }

    /**
     * 检测变更并更新缓存
     */
    public async detectAndUpdateChanges(): Promise<void> {
        if (!this.currentCacheData) {
            console.log('没有缓存数据，跳过变更检测');
            return;
        }

        this.emitStatus(CacheStatus.REFRESHING, '正在检查文件变更...');
        
        const startTime = Date.now();
        
        try {
            // 获取当前工作区的Java文件列表
            const currentFiles = await this.getCurrentJavaFiles();
            
            // 检测文件变更
            const changes = await this.fileHasher.detectChanges(
                this.currentCacheData.fileHashes,
                currentFiles
            );

            const stats = this.fileHasher.calculateChangeStatistics(changes);
            console.log(stats.summary);

            if (stats.totalChanges === 0) {
                this.emitStatus(CacheStatus.NO_CHANGES, '未发现变更');
                return;
            }

            // 有变更时进行增量更新
            await this.performIncrementalUpdate(changes);
            
            this.performanceMetrics.lastRefreshTime = Date.now() - startTime;
            
            this.emitStatus(
                CacheStatus.UPDATED, 
                `发现 ${stats.totalChanges} 个变更 (${this.performanceMetrics.lastRefreshTime}ms)`,
                currentFiles.length,
                currentFiles.length,
                changes.added.length,
                changes.modified.length,
                changes.deleted.length
            );

        } catch (error) {
            console.error('变更检测失败:', error);
            this.emitStatus(CacheStatus.ERROR, '变更检测失败');
        }
    }

    /**
     * 执行增量更新
     */
    private async performIncrementalUpdate(changes: FileChangeSet): Promise<void> {
        if (!this.currentCacheData) {
            return;
        }

        // 需要重新解析的文件（新增 + 修改）
        const filesToParse = [...changes.added, ...changes.modified];
        
        if (filesToParse.length > 0) {
            console.log(`正在解析 ${filesToParse.length} 个变更文件...`);
            
            // 调用ApiIndexer的增量更新方法（已实现）
            await this.apiIndexer.updateFiles(filesToParse);
        }

        // 处理删除的文件
        if (changes.deleted.length > 0) {
            console.log(`正在处理 ${changes.deleted.length} 个删除文件...`);
            
            for (const deletedFile of changes.deleted) {
                this.apiIndexer.removeFileEndpoints(deletedFile);
            }
        }

        // 更新缓存
        await this.saveCurrentStateToCache();
    }

    /**
     * 保存当前状态到缓存
     */
    public async saveCurrentStateToCache(): Promise<void> {
        if (!this.workspaceHash) {
            console.warn('工作区哈希未设置，无法保存缓存');
            return;
        }

        try {
            // 获取当前索引状态
            const currentState = await this.getCurrentIndexState();
            
            if (currentState) {
                await this.fileSystemCache.saveCache(this.workspaceHash, currentState);
                this.currentCacheData = currentState;
                console.log(`缓存已更新: ${currentState.endpoints.length} 个端点`);
            }
            
        } catch (error) {
            console.error('保存缓存失败:', error);
        }
    }

    /**
     * 获取当前索引状态
     */
    private async getCurrentIndexState(): Promise<CacheData | null> {
        try {
            // 获取当前Java文件列表
            const currentFiles = await this.getCurrentJavaFiles();
            
            // 计算文件哈希
            const fileHashes = await this.fileHasher.batchCalculateHashes(currentFiles);
            
            // 获取当前端点数据
            const endpoints = this.getCurrentEndpoints();
            
            // 生成统计信息
            const statistics: CacheStatistics = {
                totalFiles: currentFiles.length,
                totalEndpoints: endpoints.length,
                totalControllers: this.countUniqueControllers(endpoints),
                cacheSize: JSON.stringify(endpoints).length,
                lastScanDuration: this.performanceMetrics.lastLoadTime || this.performanceMetrics.lastRefreshTime
            };

            const cacheData: CacheData = {
                version: '1.0.0',
                workspaceHash: this.workspaceHash,
                createdAt: this.currentCacheData?.createdAt || Date.now(),
                lastUpdated: Date.now(),
                fileHashes: this.fileHasher.createHashSnapshot(fileHashes),
                endpoints,
                statistics
            };

            return cacheData;
            
        } catch (error) {
            console.error('获取当前索引状态失败:', error);
            return null;
        }
    }

    /**
     * 获取工作区路径
     */
    private getWorkspacePath(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return workspaceFolders?.[0]?.uri.fsPath || null;
    }

    /**
     * 获取当前Java文件列表 - 使用ApiIndexer的gitignore过滤逻辑
     */
    private async getCurrentJavaFiles(): Promise<string[]> {
        const workspacePath = this.getWorkspacePath();
        if (!workspacePath) {
            return [];
        }

        // 使用ApiIndexer的findJavaFiles方法，确保应用了gitignore过滤规则
        return await this.apiIndexer.findJavaFiles(workspacePath);
    }

    /**
     * 获取当前端点数据
     */
    private getCurrentEndpoints(): ApiEndpoint[] {
        // 直接调用ApiIndexer的获取方法（已实现）
        return this.apiIndexer.getAllEndpoints();
    }

    /**
     * 统计唯一控制器数量
     */
    private countUniqueControllers(endpoints: ApiEndpoint[]): number {
        const controllers = new Set(endpoints.map(ep => ep.controllerClass));
        return controllers.size;
    }

    /**
     * 发射缓存状态变更事件
     */
    private emitStatus(
        status: CacheStatus, 
        message: string,
        totalFiles?: number,
        processedFiles?: number,
        newEndpoints?: number,
        updatedEndpoints?: number,
        deletedEndpoints?: number
    ): void {
        const progress: RefreshProgress = {
            status,
            message,
            totalFiles,
            processedFiles,
            newEndpoints,
            updatedEndpoints,
            deletedEndpoints
        };
        
        this._onCacheStatusChanged.fire(progress);
    }

    /**
     * 手动刷新缓存
     */
    public async manualRefresh(): Promise<void> {
        console.log('开始手动刷新缓存...');
        await this.detectAndUpdateChanges();
    }

    /**
     * 清除缓存
     */
    public async clearCache(): Promise<void> {
        try {
            await this.fileSystemCache.clearCache(this.workspaceHash);
            this.currentCacheData = null;
            console.log('缓存已清除');
            
            this.emitStatus(CacheStatus.NOT_FOUND, '缓存已清除');
            
        } catch (error) {
            console.error('清除缓存失败:', error);
            this.emitStatus(CacheStatus.ERROR, '清除缓存失败');
        }
    }

    /**
     * 获取缓存统计信息
     */
    public async getCacheInfo(): Promise<{
        current: CacheData | null;
        performance: { lastLoadTime: number; lastRefreshTime: number; cacheHitRate: number };
        global: Awaited<ReturnType<FileSystemCache['getCacheStatistics']>>;
    }> {
        const globalStats = await this.fileSystemCache.getCacheStatistics();
        
        return {
            current: this.currentCacheData,
            performance: { ...this.performanceMetrics },
            global: globalStats
        };
    }

    /**
     * 销毁管理器，清理资源
     */
    public dispose(): void {
        this._onCacheStatusChanged.dispose();
    }

    // 修正事件发射器的属性名
    private _onDidChange = this._onCacheStatusChanged;
} 