export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiEndpoint {
    id: string;
    method: HttpMethod;
    path: string;
    classMapping: string;
    methodMapping: string;
    controllerClass: string;
    methodName: string;
    parameters: Parameter[];
    location: CodeLocation;
    annotations: Annotation[];
    pathComposition: PathComposition;
}

export interface CodeLocation {
    filePath: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
}

export interface Parameter {
    name: string;
    type: string;
    isPathVariable: boolean;
    isRequestParam: boolean;
    isRequestBody: boolean;
}

export interface Annotation {
    name: string;
    attributes?: Record<string, any>;
}

export interface PathComposition {
    classPath: string;
    methodPath: string;
    fullPath: string;
    hasClassMapping: boolean;
    hasMethodMapping: boolean;
}

export interface ControllerInfo {
    className: string;
    classLevelMapping: string;
    methods: ApiEndpoint[];
}

export interface WorkerMessage {
    type: 'parseFiles' | 'result' | 'error';
    data: any;
    id?: string;
}

export interface JavaAST {
    [key: string]: any;
}

export interface ClassNode {
    name: string;
    annotations: Annotation[];
    methods: MethodNode[];
}

export interface MethodNode {
    name: string;
    annotations: Annotation[];
    parameters: Parameter[];
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
}

// ==================== PERSISTENT CACHE TYPES ====================

/**
 * 缓存数据主结构
 */
export interface CacheData {
    version: string;                        // 缓存格式版本
    workspaceHash: string;                  // 工作区唯一标识
    createdAt: number;                      // 创建时间戳
    lastUpdated: number;                    // 最后更新时间戳
    fileHashes: Record<string, string>;     // 文件路径 -> 文件哈希映射
    endpoints: ApiEndpoint[];               // 缓存的端点数据
    statistics: CacheStatistics;           // 统计信息
}

/**
 * 缓存统计信息
 */
export interface CacheStatistics {
    totalFiles: number;                     // 总文件数
    totalEndpoints: number;                 // 总端点数
    totalControllers: number;               // 总控制器数
    cacheSize: number;                      // 缓存大小(字节)
    lastScanDuration: number;               // 上次扫描耗时(毫秒)
}

/**
 * 文件变更集合
 */
export interface FileChangeSet {
    added: string[];                        // 新增文件路径
    modified: string[];                     // 修改文件路径
    deleted: string[];                      // 删除文件路径
    unchanged: string[];                    // 未变更文件路径
}

/**
 * 缓存状态枚举
 */
export enum CacheStatus {
    LOADING = 'loading',                    // 正在加载缓存
    LOADED = 'loaded',                      // 缓存已加载
    REFRESHING = 'refreshing',              // 正在后台刷新
    UPDATED = 'updated',                    // 刷新完成，有更新
    NO_CHANGES = 'no_changes',              // 刷新完成，无变更
    ERROR = 'error',                        // 缓存错误
    NOT_FOUND = 'not_found'                 // 缓存不存在
}

/**
 * 刷新进度信息
 */
export interface RefreshProgress {
    status: CacheStatus;                    // 当前状态
    message: string;                        // 状态描述
    totalFiles?: number;                    // 总文件数
    processedFiles?: number;                // 已处理文件数
    newEndpoints?: number;                  // 新发现端点数
    updatedEndpoints?: number;              // 更新端点数
    deletedEndpoints?: number;              // 删除端点数
}

/**
 * 缓存配置选项
 */
export interface CacheOptions {
    enabled: boolean;                       // 是否启用缓存
    maxCacheSize: number;                   // 最大缓存大小(字节)
    maxCacheAge: number;                    // 缓存最大年龄(毫秒)
    compressionEnabled: boolean;            // 是否启用压缩
    autoCleanup: boolean;                   // 是否自动清理过期缓存
}