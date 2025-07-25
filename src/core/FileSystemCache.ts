import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { CacheData, CacheOptions, CacheStatistics } from './types';

/**
 * 文件系统缓存管理器
 * 负责缓存数据的持久化存储和管理
 */
export class FileSystemCache {
    private readonly cacheDir: string;
    private readonly defaultOptions: CacheOptions = {
        enabled: true,
        maxCacheSize: 50 * 1024 * 1024, // 50MB
        maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7天
        compressionEnabled: false, // 暂不启用压缩
        autoCleanup: true
    };

    constructor(private options: Partial<CacheOptions> = {}) {
        this.cacheDir = this.getCacheDir();
        this.options = { ...this.defaultOptions, ...options };
    }

    /**
     * 获取缓存目录路径
     */
    private getCacheDir(): string {
        return path.join(os.homedir(), '.xkcoding-api-navigator', 'cache');
    }

    /**
     * 获取指定工作区的缓存文件路径
     */
    private getCacheFilePath(workspaceHash: string): string {
        return path.join(this.cacheDir, `${workspaceHash}.json`);
    }

    /**
     * 生成工作区哈希
     */
    public generateWorkspaceHash(workspacePath: string): string {
        return crypto.createHash('sha256')
            .update(workspacePath)
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * 确保缓存目录存在
     */
    private async ensureCacheDirectory(): Promise<void> {
        try {
            await fs.promises.access(this.cacheDir);
        } catch {
            await fs.promises.mkdir(this.cacheDir, { recursive: true });
        }
    }

    /**
     * 保存缓存数据
     */
    public async saveCache(workspaceHash: string, data: CacheData): Promise<void> {
        if (!this.options.enabled) {
            return;
        }

        try {
            await this.ensureCacheDirectory();
            
            const filePath = this.getCacheFilePath(workspaceHash);
            const jsonData = JSON.stringify(data, null, 2);
            
            // 检查缓存大小限制
            if (this.options.maxCacheSize && Buffer.byteLength(jsonData) > this.options.maxCacheSize) {
                console.warn(`缓存数据过大 (${Buffer.byteLength(jsonData)} bytes)，超过限制 (${this.options.maxCacheSize} bytes)`);
                return;
            }

            await fs.promises.writeFile(filePath, jsonData, 'utf-8');
            console.log(`缓存已保存: ${filePath} (${Buffer.byteLength(jsonData)} bytes)`);
            
        } catch (error) {
            console.error('保存缓存失败:', error);
            throw new Error(`缓存保存失败: ${error}`);
        }
    }

    /**
     * 加载缓存数据
     */
    public async loadCache(workspaceHash: string): Promise<CacheData | null> {
        if (!this.options.enabled) {
            return null;
        }

        try {
            const filePath = this.getCacheFilePath(workspaceHash);
            
            // 检查文件是否存在
            try {
                await fs.promises.access(filePath);
            } catch {
                console.log(`缓存文件不存在: ${filePath}`);
                return null;
            }

            // 检查文件年龄
            const stats = await fs.promises.stat(filePath);
            const fileAge = Date.now() - stats.mtime.getTime();
            
            if (this.options.maxCacheAge && fileAge > this.options.maxCacheAge) {
                console.log(`缓存文件过期 (${Math.round(fileAge / (1000 * 60 * 60))} 小时)，已删除`);
                await this.clearCache(workspaceHash);
                return null;
            }

            // 读取并解析缓存数据
            const jsonData = await fs.promises.readFile(filePath, 'utf-8');
            const cacheData = JSON.parse(jsonData) as CacheData;
            
            // 验证缓存数据结构
            if (!this.validateCacheData(cacheData)) {
                console.warn('缓存数据格式无效，已删除');
                await this.clearCache(workspaceHash);
                return null;
            }

            console.log(`缓存已加载: ${filePath} (${cacheData.endpoints.length} 个端点)`);
            return cacheData;
            
        } catch (error) {
            console.error('加载缓存失败:', error);
            // 缓存损坏时删除文件
            await this.clearCache(workspaceHash);
            return null;
        }
    }

    /**
     * 清除指定工作区的缓存
     */
    public async clearCache(workspaceHash?: string): Promise<void> {
        try {
            if (workspaceHash) {
                // 清除特定工作区缓存
                const filePath = this.getCacheFilePath(workspaceHash);
                try {
                    await fs.promises.unlink(filePath);
                    console.log(`已清除缓存: ${filePath}`);
                } catch (error) {
                    // 文件不存在时忽略错误
                    if ((error as any).code !== 'ENOENT') {
                        throw error;
                    }
                }
            } else {
                // 清除所有缓存
                try {
                    const files = await fs.promises.readdir(this.cacheDir);
                    const jsonFiles = files.filter(file => file.endsWith('.json'));
                    
                    await Promise.all(
                        jsonFiles.map(file => 
                            fs.promises.unlink(path.join(this.cacheDir, file))
                        )
                    );
                    
                    console.log(`已清除 ${jsonFiles.length} 个缓存文件`);
                } catch (error) {
                    if ((error as any).code !== 'ENOENT') {
                        throw error;
                    }
                }
            }
        } catch (error) {
            console.error('清除缓存失败:', error);
            throw new Error(`清除缓存失败: ${error}`);
        }
    }

    /**
     * 获取缓存统计信息
     */
    public async getCacheStatistics(): Promise<{ totalCaches: number; totalSize: number; oldestCache?: Date; newestCache?: Date }> {
        try {
            await this.ensureCacheDirectory();
            const files = await fs.promises.readdir(this.cacheDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            let totalSize = 0;
            let oldestCache: Date | undefined;
            let newestCache: Date | undefined;
            
            for (const file of jsonFiles) {
                const filePath = path.join(this.cacheDir, file);
                const stats = await fs.promises.stat(filePath);
                
                totalSize += stats.size;
                
                if (!oldestCache || stats.mtime < oldestCache) {
                    oldestCache = stats.mtime;
                }
                
                if (!newestCache || stats.mtime > newestCache) {
                    newestCache = stats.mtime;
                }
            }
            
            return {
                totalCaches: jsonFiles.length,
                totalSize,
                oldestCache,
                newestCache
            };
            
        } catch (error) {
            console.error('获取缓存统计失败:', error);
            return { totalCaches: 0, totalSize: 0 };
        }
    }

    /**
     * 自动清理过期缓存
     */
    public async cleanupExpiredCaches(): Promise<number> {
        if (!this.options.autoCleanup || !this.options.maxCacheAge) {
            return 0;
        }

        try {
            await this.ensureCacheDirectory();
            const files = await fs.promises.readdir(this.cacheDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            let cleanedCount = 0;
            const now = Date.now();
            
            for (const file of jsonFiles) {
                const filePath = path.join(this.cacheDir, file);
                const stats = await fs.promises.stat(filePath);
                const fileAge = now - stats.mtime.getTime();
                
                if (fileAge > this.options.maxCacheAge) {
                    await fs.promises.unlink(filePath);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`自动清理了 ${cleanedCount} 个过期缓存文件`);
            }
            
            return cleanedCount;
            
        } catch (error) {
            console.error('自动清理缓存失败:', error);
            return 0;
        }
    }

    /**
     * 验证缓存数据结构
     */
    private validateCacheData(data: any): data is CacheData {
        return (
            data &&
            typeof data === 'object' &&
            typeof data.version === 'string' &&
            typeof data.workspaceHash === 'string' &&
            typeof data.createdAt === 'number' &&
            typeof data.lastUpdated === 'number' &&
            typeof data.fileHashes === 'object' &&
            Array.isArray(data.endpoints) &&
            typeof data.statistics === 'object'
        );
    }

    /**
     * 获取缓存选项
     */
    public getOptions(): CacheOptions {
        return { ...this.options } as CacheOptions;
    }

    /**
     * 更新缓存选项
     */
    public updateOptions(newOptions: Partial<CacheOptions>): void {
        this.options = { ...this.options, ...newOptions };
    }
} 