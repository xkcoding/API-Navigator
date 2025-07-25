import * as fs from 'fs';
import * as crypto from 'crypto';
import { FileChangeSet } from './types';

/**
 * 文件哈希计算和变更检测器
 * 负责计算文件哈希值和检测文件变更
 */
export class FileHasher {
    
    /**
     * 计算单个文件的SHA-256哈希值
     */
    public async calculateFileHash(filePath: string): Promise<string> {
        try {
            const content = await fs.promises.readFile(filePath);
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch (error) {
            // 文件不存在或读取失败时返回特殊值
            console.warn(`无法读取文件进行哈希计算: ${filePath}`, error);
            return 'FILE_NOT_FOUND';
        }
    }

    /**
     * 批量计算多个文件的哈希值
     */
    public async batchCalculateHashes(filePaths: string[]): Promise<Map<string, string>> {
        const hashMap = new Map<string, string>();
        
        // 使用Promise.allSettled确保即使部分文件失败也能继续
        const results = await Promise.allSettled(
            filePaths.map(async (filePath) => {
                const hash = await this.calculateFileHash(filePath);
                return { filePath, hash };
            })
        );

        // 处理结果
        for (const result of results) {
            if (result.status === 'fulfilled') {
                hashMap.set(result.value.filePath, result.value.hash);
            } else {
                console.warn('批量哈希计算失败:', result.reason);
                // 失败的文件标记为未找到
                const failedPath = filePaths.find(path => !hashMap.has(path));
                if (failedPath) {
                    hashMap.set(failedPath, 'FILE_NOT_FOUND');
                }
            }
        }

        return hashMap;
    }

    /**
     * 检测文件变更
     * 比较缓存的文件哈希与当前文件哈希，返回变更集合
     */
    public async detectChanges(
        cachedHashes: Record<string, string>,
        currentFiles: string[]
    ): Promise<FileChangeSet> {
        const changes: FileChangeSet = {
            added: [],
            modified: [],
            deleted: [],
            unchanged: []
        };

        // 计算当前文件的哈希值
        const currentHashes = await this.batchCalculateHashes(currentFiles);
        
        // 检测新增和修改的文件
        for (const [filePath, currentHash] of currentHashes) {
            if (currentHash === 'FILE_NOT_FOUND') {
                // 文件读取失败，跳过
                continue;
            }

            const cachedHash = cachedHashes[filePath];
            
            if (!cachedHash) {
                // 新增文件
                changes.added.push(filePath);
            } else if (cachedHash !== currentHash) {
                // 修改文件
                changes.modified.push(filePath);
            } else {
                // 未变更文件
                changes.unchanged.push(filePath);
            }
        }

        // 检测删除的文件
        const currentFileSet = new Set(currentFiles);
        for (const cachedFilePath of Object.keys(cachedHashes)) {
            if (!currentFileSet.has(cachedFilePath)) {
                changes.deleted.push(cachedFilePath);
            }
        }

        return changes;
    }

    /**
     * 快速检测单个文件是否变更
     */
    public async hasFileChanged(filePath: string, cachedHash: string): Promise<boolean> {
        const currentHash = await this.calculateFileHash(filePath);
        return currentHash !== cachedHash && currentHash !== 'FILE_NOT_FOUND';
    }

    /**
     * 创建文件哈希映射的快照
     */
    public createHashSnapshot(hashes: Map<string, string>): Record<string, string> {
        const snapshot: Record<string, string> = {};
        for (const [filePath, hash] of hashes) {
            if (hash !== 'FILE_NOT_FOUND') {
                snapshot[filePath] = hash;
            }
        }
        return snapshot;
    }

    /**
     * 验证文件哈希映射的完整性
     */
    public async validateHashMap(hashMap: Record<string, string>): Promise<{
        valid: number;
        invalid: string[];
        missing: string[];
    }> {
        const result = {
            valid: 0,
            invalid: [] as string[],
            missing: [] as string[]
        };

        for (const [filePath, expectedHash] of Object.entries(hashMap)) {
            try {
                // 检查文件是否存在
                await fs.promises.access(filePath);
                
                // 计算当前哈希
                const currentHash = await this.calculateFileHash(filePath);
                
                if (currentHash === expectedHash) {
                    result.valid++;
                } else if (currentHash === 'FILE_NOT_FOUND') {
                    result.missing.push(filePath);
                } else {
                    result.invalid.push(filePath);
                }
            } catch {
                result.missing.push(filePath);
            }
        }

        return result;
    }

    /**
     * 计算变更统计信息
     */
    public calculateChangeStatistics(changes: FileChangeSet): {
        totalChanges: number;
        changeRate: number;
        summary: string;
    } {
        const totalChanges = changes.added.length + changes.modified.length + changes.deleted.length;
        const totalFiles = totalChanges + changes.unchanged.length;
        const changeRate = totalFiles > 0 ? (totalChanges / totalFiles) * 100 : 0;

        const summary = `变更统计: 新增${changes.added.length}个, 修改${changes.modified.length}个, 删除${changes.deleted.length}个, 未变更${changes.unchanged.length}个`;

        return {
            totalChanges,
            changeRate,
            summary
        };
    }

    /**
     * 获取文件的元数据信息（用于更精确的变更检测）
     */
    public async getFileMetadata(filePath: string): Promise<{
        size: number;
        mtime: number;
        exists: boolean;
    }> {
        try {
            const stats = await fs.promises.stat(filePath);
            return {
                size: stats.size,
                mtime: stats.mtime.getTime(),
                exists: true
            };
        } catch {
            return {
                size: 0,
                mtime: 0,
                exists: false
            };
        }
    }

    /**
     * 基于文件元数据的快速变更检测（用于预筛选）
     * 只有元数据变更的文件才需要重新计算哈希
     */
    public async detectPotentialChanges(
        cachedMetadata: Record<string, { size: number; mtime: number }>,
        currentFiles: string[]
    ): Promise<{
        potentialChanges: string[];
        definitelyUnchanged: string[];
    }> {
        const potentialChanges: string[] = [];
        const definitelyUnchanged: string[] = [];

        for (const filePath of currentFiles) {
            const cached = cachedMetadata[filePath];
            
            if (!cached) {
                // 新文件
                potentialChanges.push(filePath);
                continue;
            }

            const current = await this.getFileMetadata(filePath);
            
            if (!current.exists) {
                // 文件不存在，跳过
                continue;
            }

            if (current.size !== cached.size || current.mtime !== cached.mtime) {
                // 元数据变更，需要重新计算哈希
                potentialChanges.push(filePath);
            } else {
                // 元数据未变更，很可能文件内容也未变更
                definitelyUnchanged.push(filePath);
            }
        }

        return {
            potentialChanges,
            definitelyUnchanged
        };
    }
} 