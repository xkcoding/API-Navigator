import * as vscode from 'vscode';
import * as path from 'path';
import { ApiIndexer } from '../core/ApiIndexer';
import { ApiEndpoint, HttpMethod, CacheStatus, RefreshProgress } from '../core/types';
import { IconConfig } from './IconConfig';

interface TreeNode {
    id: string;
    label: string;
    type: 'controller' | 'endpoint' | 'loading' | 'loadMore' | 'searchState';
    endpoint?: ApiEndpoint;
    children?: TreeNode[];
    metadata?: {
        controllerClass?: string;
        loadedCount?: number;
        totalCount?: number;
        batchSize?: number;
        cacheStatus?: CacheStatus;
        cacheMessage?: string;
        action?: string; // 新增：用于搜索状态节点
        query?: string; // 新增：用于搜索状态节点
        resultCount?: number; // 新增：用于搜索状态节点
    };
}

export class ApiNavigatorProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    // 分批加载配置
    private readonly INITIAL_CONTROLLER_BATCH = 10; // 初始显示10个控制器
    private readonly CONTROLLER_BATCH_SIZE = 20;    // 后续每批20个控制器
    private readonly INITIAL_ENDPOINT_BATCH = 15;   // 初始显示15个端点
    private readonly ENDPOINT_BATCH_SIZE = 30;      // 后续每批30个端点
    private readonly AUTO_LOAD_DELAY = 100;         // 自动加载延迟（毫秒）

    // 分批加载状态
    private controllerLoadState = new Map<string, number>(); // 记录每个级别已加载的数量
    private endpointLoadState = new Map<string, number>();   // 记录每个控制器已加载的端点数量
    private loadingStates = new Map<string, boolean>();      // 记录正在加载的状态

    // 刷新状态管理
    private isRefreshing = false;
    private pendingTimeouts = new Set<NodeJS.Timeout>();     // 跟踪待处理的定时器

    // 搜索状态
    private searchQuery: string = '';
    private filteredEndpoints: ApiEndpoint[] = [];

    // 缓存状态
    private currentCacheStatus: CacheStatus = CacheStatus.NOT_FOUND;
    private cacheMessage: string = '';
    private cacheManager?: any; // PersistentIndexManager类型，避免循环导入

    constructor(private apiIndexer: ApiIndexer, cacheManager?: any) {
        this.cacheManager = cacheManager;
        // 监听索引器的变化
        this.setupIndexerListeners();
        // 设置缓存状态监听器
        this.setupCacheStatusListeners();
    }

    /**
     * 设置索引器监听器
     */
    private setupIndexerListeners(): void {
        // 监听索引器的变化事件，自动刷新树视图
        this.apiIndexer.onDidChange(() => {
            this.refresh();
        });
    }

    /**
     * 设置缓存状态监听器
     */
    private setupCacheStatusListeners(): void {
        if (this.cacheManager && typeof this.cacheManager.onCacheStatusChanged === 'function') {
            this.cacheManager.onCacheStatusChanged((progress: RefreshProgress) => {
                this.updateCacheStatus(progress);
            });
        }
    }

    /**
     * 更新缓存状态
     */
    private updateCacheStatus(progress: RefreshProgress): void {
        this.currentCacheStatus = progress.status;
        this.cacheMessage = progress.message;
        
        // 根据缓存状态显示不同类型的通知
        this.showCacheStatusNotification(progress.status, progress.message);
    }

    /**
     * 显示缓存状态通知
     */
    private showCacheStatusNotification(status: CacheStatus, message: string): void {
        const statusIcon = this.getCacheStatusIcon(status);
        const notificationMessage = `${statusIcon} ${message || this.getDefaultCacheMessage(status)}`;
        
        switch (status) {
            case CacheStatus.LOADED:
            case CacheStatus.UPDATED:
                // 成功状态 - 显示信息通知
                vscode.window.showInformationMessage(notificationMessage);
                break;
                
            case CacheStatus.NO_CHANGES:
                // 无变更 - 显示状态栏消息（3秒自动消失）
                vscode.window.setStatusBarMessage(notificationMessage, 3000);
                break;
                
            case CacheStatus.ERROR:
            case CacheStatus.NOT_FOUND:
                // 错误状态 - 显示警告通知
                vscode.window.showWarningMessage(notificationMessage);
                break;
                
            case CacheStatus.LOADING:
            case CacheStatus.REFRESHING:
                // 加载状态 - 显示状态栏消息（不自动消失，等待后续状态更新）
                vscode.window.setStatusBarMessage(notificationMessage);
                break;
        }
    }



    /**
     * 获取缓存状态图标
     */
    private getCacheStatusIcon(status: CacheStatus): string {
        switch (status) {
            case CacheStatus.LOADING:
                return '⏳';
            case CacheStatus.LOADED:
                return '✅';
            case CacheStatus.REFRESHING:
                return '🔄';
            case CacheStatus.UPDATED:
                return '🔄';
            case CacheStatus.NO_CHANGES:
                return '✅';
            case CacheStatus.ERROR:
                return '❌';
            case CacheStatus.NOT_FOUND:
                return '💾';
            default:
                return '📄';
        }
    }

    /**
     * 获取默认缓存状态消息
     */
    private getDefaultCacheMessage(status: CacheStatus): string {
        switch (status) {
            case CacheStatus.LOADING:
                return '正在加载缓存...';
            case CacheStatus.LOADED:
                return '缓存已加载';
            case CacheStatus.REFRESHING:
                return '正在刷新...';
            case CacheStatus.UPDATED:
                return '缓存已更新';
            case CacheStatus.NO_CHANGES:
                return '无变更';
            case CacheStatus.ERROR:
                return '缓存错误';
            case CacheStatus.NOT_FOUND:
                return '无缓存';
            default:
                return '未知状态';
        }
    }

    /**
     * 刷新树视图
     */
    public refresh(): void {
        // 防止并发刷新
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;

        // 清除所有待处理的定时器
        this.pendingTimeouts.forEach(timeout => clearTimeout(timeout));
        this.pendingTimeouts.clear();

        // 重置分批加载状态
        this.controllerLoadState.clear();
        this.endpointLoadState.clear();
        this.loadingStates.clear();

        // 触发树视图刷新
        this._onDidChangeTreeData.fire();

        // 重置刷新状态
        setTimeout(() => {
            this.isRefreshing = false;
        }, 100);
    }

    /**
     * 处理加载更多请求（现主要用于兼容性）
     */
    public loadMore(node: TreeNode): void {
        // 保留原有功能以保证兼容性，但不再推荐使用
        if (!node.metadata) return;

        if (node.id === 'loadMore-controllers') {
            const currentLoaded = node.metadata.loadedCount || 0;
            const batchSize = node.metadata.batchSize || this.CONTROLLER_BATCH_SIZE;
            this.controllerLoadState.set('root', currentLoaded + batchSize);
        } else if (node.id === 'loadMore-search') {
            const currentLoaded = node.metadata.loadedCount || 0;
            const batchSize = node.metadata.batchSize || this.ENDPOINT_BATCH_SIZE;
            this.controllerLoadState.set('search', currentLoaded + batchSize);
        } else if (node.id.startsWith('loadMore-endpoints-') && node.metadata.controllerClass) {
            const controllerClass = node.metadata.controllerClass;
            const currentLoaded = node.metadata.loadedCount || 0;
            const batchSize = node.metadata.batchSize || this.ENDPOINT_BATCH_SIZE;
            this.endpointLoadState.set(controllerClass, currentLoaded + batchSize);
        }

        this._onDidChangeTreeData.fire();
    }

    /**
     * 自动异步加载更多控制器
     */
    private async autoLoadMoreControllers(): Promise<void> {
        if (this.loadingStates.get('controllers') || this.isRefreshing) return; // 防止重复加载或在刷新时加载
        
        this.loadingStates.set('controllers', true);
        const currentLoaded = this.controllerLoadState.get('root') || this.INITIAL_CONTROLLER_BATCH;
        const controllerClasses = this.apiIndexer.getAllControllerClasses();
        
        if (currentLoaded < controllerClasses.length) {
            // 延迟加载，给用户更好的体验
            const timeout = setTimeout(() => {
                // 从待处理定时器集合中移除
                this.pendingTimeouts.delete(timeout);
                
                // 检查是否在刷新中，如果是则跳过
                if (this.isRefreshing) {
                    this.loadingStates.set('controllers', false);
                    return;
                }

                this.controllerLoadState.set('root', currentLoaded + this.CONTROLLER_BATCH_SIZE);
                this.loadingStates.set('controllers', false);
                this._onDidChangeTreeData.fire();
                
                // 如果还有更多数据，继续自动加载
                if (this.controllerLoadState.get('root')! < controllerClasses.length) {
                    const nextTimeout = setTimeout(() => this.autoLoadMoreControllers(), this.AUTO_LOAD_DELAY);
                    this.pendingTimeouts.add(nextTimeout);
                }
            }, this.AUTO_LOAD_DELAY);
            
            // 跟踪这个定时器
            this.pendingTimeouts.add(timeout);
        } else {
            this.loadingStates.set('controllers', false);
        }
    }

    /**
     * 自动异步加载更多端点
     */
    private async autoLoadMoreEndpoints(controllerClass: string): Promise<void> {
        const loadingKey = `endpoints-${controllerClass}`;
        if (this.loadingStates.get(loadingKey) || this.isRefreshing) return; // 防止重复加载或在刷新时加载
        
        this.loadingStates.set(loadingKey, true);
        const currentLoaded = this.endpointLoadState.get(controllerClass) || this.INITIAL_ENDPOINT_BATCH;
        const endpoints = this.apiIndexer.findByController(controllerClass);
        
        if (currentLoaded < endpoints.length) {
            const timeout = setTimeout(() => {
                // 从待处理定时器集合中移除
                this.pendingTimeouts.delete(timeout);
                
                // 检查是否在刷新中，如果是则跳过
                if (this.isRefreshing) {
                    this.loadingStates.set(loadingKey, false);
                    return;
                }

                this.endpointLoadState.set(controllerClass, currentLoaded + this.ENDPOINT_BATCH_SIZE);
                this.loadingStates.set(loadingKey, false);
                this._onDidChangeTreeData.fire();
                
                // 如果还有更多数据，继续自动加载
                if (this.endpointLoadState.get(controllerClass)! < endpoints.length) {
                    const nextTimeout = setTimeout(() => this.autoLoadMoreEndpoints(controllerClass), this.AUTO_LOAD_DELAY);
                    this.pendingTimeouts.add(nextTimeout);
                }
            }, this.AUTO_LOAD_DELAY);
            
            // 跟踪这个定时器
            this.pendingTimeouts.add(timeout);
        } else {
            this.loadingStates.set(loadingKey, false);
        }
    }

    /**
     * 自动异步加载更多搜索结果
     */
    private async autoLoadMoreSearchResults(): Promise<void> {
        if (this.loadingStates.get('search') || this.isRefreshing) return; // 防止重复加载或在刷新时加载
        
        this.loadingStates.set('search', true);
        const currentLoaded = this.endpointLoadState.get('search') || this.INITIAL_ENDPOINT_BATCH;
        
        if (currentLoaded < this.filteredEndpoints.length) {
            const timeout = setTimeout(() => {
                // 从待处理定时器集合中移除
                this.pendingTimeouts.delete(timeout);
                
                // 检查是否在刷新中，如果是则跳过
                if (this.isRefreshing) {
                    this.loadingStates.set('search', false);
                    return;
                }

                this.endpointLoadState.set('search', currentLoaded + this.ENDPOINT_BATCH_SIZE);
                this.loadingStates.set('search', false);
                this._onDidChangeTreeData.fire();
                
                // 如果还有更多数据，继续自动加载
                if (this.endpointLoadState.get('search')! < this.filteredEndpoints.length) {
                    const nextTimeout = setTimeout(() => this.autoLoadMoreSearchResults(), this.AUTO_LOAD_DELAY);
                    this.pendingTimeouts.add(nextTimeout);
                }
            }, this.AUTO_LOAD_DELAY);
            
            // 跟踪这个定时器
            this.pendingTimeouts.add(timeout);
        } else {
            this.loadingStates.set('search', false);
        }
    }

    /**
     * 设置搜索查询
     */
    public setSearchQuery(query: string): void {
        this.searchQuery = query.trim();
        
        if (this.searchQuery) {
            // 执行搜索
            this.filteredEndpoints = this.apiIndexer.searchEndpoints(this.searchQuery);
        } else {
            // 清空搜索结果
            this.filteredEndpoints = [];
        }
        
        // 重置分批加载状态
        this.controllerLoadState.clear();
        this.endpointLoadState.clear();
        
        // 刷新树视图
        this._onDidChangeTreeData.fire();
    }

    /**
     * 清空搜索
     */
    public clearSearch(): void {
        this.setSearchQuery('');
    }

    /**
     * 获取当前搜索查询
     */
    public getSearchQuery(): string {
        return this.searchQuery;
    }

    /**
     * 检查是否处于搜索模式
     */
    private isSearchMode(): boolean {
        return this.searchQuery.length > 0;
    }

    /**
     * 获取树项
     */
    getTreeItem(element: TreeNode): vscode.TreeItem {
        if (element.type === 'controller') {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.Expanded
            );
            item.iconPath = new vscode.ThemeIcon('symbol-class');
            item.tooltip = `控制器: ${element.label}`;
            item.contextValue = 'controller';
            return item;
        } else if (element.type === 'endpoint' && element.endpoint) {
            const endpoint = element.endpoint;
            const item = new vscode.TreeItem(
                this.formatEndpointLabel(endpoint),
                vscode.TreeItemCollapsibleState.None
            );
            
            // 设置图标
            item.iconPath = this.getMethodIcon(endpoint.method);
            
            // 在description中显示方法名，VSCode会自动以较浅的颜色显示
            item.description = endpoint.methodName;
            item.tooltip = this.createEndpointTooltip(endpoint);
            
            // 设置点击命令
            item.command = {
                command: 'apiNavigator.openApi',
                title: 'Open API',
                arguments: [endpoint]
            };
            
            item.contextValue = 'endpoint';
            return item;
        } else if (element.type === 'loadMore') {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.None
            );
            
            item.iconPath = new vscode.ThemeIcon('chevron-down');
            item.tooltip = '点击加载更多';
            
            // 设置点击命令来加载更多项目
            item.command = {
                command: 'apiNavigator.loadMore',
                title: 'Load More',
                arguments: [element]
            };
            
            item.contextValue = 'loadMore';
            return item;
        } else if (element.type === 'loading') {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.None
            );
            
            item.iconPath = new vscode.ThemeIcon('loading~spin');
            item.tooltip = '正在加载...';
            item.contextValue = 'loading';
            return item;
        } else if (element.type === 'endpoint' && !element.endpoint) {
            // 空状态节点：为友好提示设置合适的图标和样式
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.None
            );
            
            // 根据节点ID设置不同的图标
            if (element.id.includes('welcome')) {
                item.iconPath = new vscode.ThemeIcon('star');
                item.tooltip = '欢迎使用API Navigator';
            } else if (element.id.includes('guide-1')) {
                item.iconPath = new vscode.ThemeIcon('folder');
                item.tooltip = '确保项目包含Java源文件';
            } else if (element.id.includes('guide-2')) {
                item.iconPath = new vscode.ThemeIcon('search');
                item.tooltip = '检查Spring Boot注解';
            } else if (element.id.includes('refresh')) {
                item.iconPath = new vscode.ThemeIcon('refresh');
                item.tooltip = '重新扫描项目';
                // 为刷新节点添加点击命令
                item.command = {
                    command: 'apiNavigator.refresh',
                    title: 'Refresh',
                    arguments: []
                };
            }
            
            item.contextValue = 'emptyState';
            return item;
        } else if (element.type === 'searchState') {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.None
            );
            
            // 根据不同的action设置不同的图标和行为
            const action = element.metadata?.action;
            switch (action) {
                case 'current':
                    item.iconPath = new vscode.ThemeIcon('search');
                    item.tooltip = `搜索结果: ${element.metadata?.resultCount || 0} 个匹配项`;
                    break;
                case 'edit':
                    item.iconPath = new vscode.ThemeIcon('edit');
                    item.tooltip = '点击编辑搜索条件';
                    item.command = {
                        command: 'apiNavigator.editSearch',
                        title: 'Edit Search',
                        arguments: [element]
                    };
                    break;
                case 'clear':
                    item.iconPath = new vscode.ThemeIcon('close');
                    item.tooltip = '点击清除搜索，显示全部内容';
                    item.command = {
                        command: 'apiNavigator.clearPanelSearch',
                        title: 'Clear Search',
                        arguments: []
                    };
                    break;
                case 'start':
                    item.iconPath = new vscode.ThemeIcon('search');
                    item.tooltip = '点击开始搜索API端点';
                    item.command = {
                        command: 'apiNavigator.startSearch',
                        title: 'Start Search',
                        arguments: [element]
                    };
                    break;
                case 'separator':
                    item.iconPath = new vscode.ThemeIcon('dash');
                    item.tooltip = '';
                    break;
                default:
                    item.iconPath = new vscode.ThemeIcon('search');
                    break;
            }
            
            item.contextValue = 'searchState';
            return item;
        }

        return new vscode.TreeItem('Unknown');
    }

    /**
     * 获取子节点
     */
    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            // 根级别：显示主要内容
            const nodes: TreeNode[] = [];
            
            // 添加搜索状态节点
            nodes.push(...this.getSearchStateNodes());

            if (this.isSearchMode()) {
                // 搜索模式：添加搜索结果
                nodes.push(...this.getSearchResultNodes());
            } else {
                // 正常模式：添加控制器分组
                nodes.push(...this.getControllerNodes());
            }
            
            return Promise.resolve(nodes);
        } else if (element.type === 'controller' && !this.isSearchMode()) {
            // 控制器节点：返回该控制器的端点（仅在非搜索模式）
            return Promise.resolve(this.getEndpointNodes(element.id));
        }
        
        return Promise.resolve([]);
    }

    /**
     * 获取控制器节点（支持自动异步分批加载）
     */
    private getControllerNodes(): TreeNode[] {
        const controllerClasses = this.apiIndexer.getAllControllerClasses();
        
        // 按字母顺序排序控制器类名
        controllerClasses.sort((a, b) => {
            // 比较类名（不包含包名）
            const classNameA = a.split('.').pop() || a;
            const classNameB = b.split('.').pop() || b;
            return classNameA.localeCompare(classNameB);
        });
        
        const totalCount = controllerClasses.length;
        
        // 空状态处理：当没有找到API控制器时显示友好提示
        if (totalCount === 0) {
            return this.getEmptyStateNodes();
        }
        
        // 获取已加载的控制器数量，首次加载显示初始批次
        let loadedCount = this.controllerLoadState.get('root');
        if (loadedCount === undefined) {
            loadedCount = Math.min(this.INITIAL_CONTROLLER_BATCH, totalCount);
            this.controllerLoadState.set('root', loadedCount);
            
            // 如果还有更多数据，自动触发后续异步加载
            if (loadedCount < totalCount) {
                setTimeout(() => this.autoLoadMoreControllers(), this.AUTO_LOAD_DELAY);
            }
        }
        
        // 显示已加载的控制器
        const currentBatch = controllerClasses.slice(0, loadedCount);
        const nodes: TreeNode[] = currentBatch.map(className => ({
            id: className,
            label: this.formatControllerName(className),
            type: 'controller' as const,
            children: []
        }));
        
        // 如果正在加载更多，显示加载指示器
        if (this.loadingStates.get('controllers') && loadedCount < totalCount) {
            nodes.push({
                id: 'loading-controllers',
                label: `⚡ 正在加载更多控制器... (${loadedCount}/${totalCount})`,
                type: 'loading'
            });
        }
        
        return nodes;
    }

    /**
     * 获取空状态节点 - 当没有找到API端点时显示友好提示
     */
    private getEmptyStateNodes(): TreeNode[] {
        return [
            {
                id: 'empty-state-welcome',
                label: '🚀 欢迎使用 API Navigator',
                type: 'endpoint',
                endpoint: undefined,
                metadata: {
                    cacheStatus: this.currentCacheStatus,
                    cacheMessage: '当前项目中未找到Spring Boot API端点'
                }
            },
            {
                id: 'empty-state-guide-1',
                label: '📁 请确保项目包含Java Spring Boot源文件',
                type: 'endpoint',
                endpoint: undefined
            },
            {
                id: 'empty-state-guide-2',
                label: '🔍 检查是否有@RestController或@Controller注解',
                type: 'endpoint',
                endpoint: undefined
            },
            {
                id: 'empty-state-refresh',
                label: '♻️ 点击刷新按钮重新扫描项目',
                type: 'endpoint',
                endpoint: undefined
            }
        ];
    }

    /**
     * 获取端点节点（支持自动异步分批加载）
     */
    private getEndpointNodes(controllerClass: string): TreeNode[] {
        const endpoints = this.apiIndexer.findByController(controllerClass);
        const totalCount = endpoints.length;
        
        // 按 HTTP 方法和路径排序
        endpoints.sort((a, b) => {
            if (a.method !== b.method) {
                return this.getMethodOrder(a.method) - this.getMethodOrder(b.method);
            }
            return a.path.localeCompare(b.path);
        });

        // 获取已加载的端点数量，首次加载显示初始批次
        let loadedCount = this.endpointLoadState.get(controllerClass);
        if (loadedCount === undefined) {
            loadedCount = Math.min(this.INITIAL_ENDPOINT_BATCH, totalCount);
            this.endpointLoadState.set(controllerClass, loadedCount);
            
            // 如果还有更多数据，自动触发后续异步加载
            if (loadedCount < totalCount) {
                setTimeout(() => this.autoLoadMoreEndpoints(controllerClass), this.AUTO_LOAD_DELAY);
            }
        }
        
        // 显示已加载的端点
        const currentBatch = endpoints.slice(0, loadedCount);
        const nodes: TreeNode[] = currentBatch.map(endpoint => ({
            id: endpoint.id,
            label: endpoint.methodName,
            type: 'endpoint' as const,
            endpoint
        }));
        
        // 如果正在加载更多，显示加载指示器
        const loadingKey = `endpoints-${controllerClass}`;
        if (this.loadingStates.get(loadingKey) && loadedCount < totalCount) {
            nodes.push({
                id: `loading-endpoints-${controllerClass}`,
                label: `⚡ 正在加载更多端点... (${loadedCount}/${totalCount})`,
                type: 'loading'
            });
        }
        
        return nodes;
    }

    /**
     * 获取搜索结果节点（扁平化显示）
     */
    private getSearchResultNodes(): TreeNode[] {
        if (!this.isSearchMode() || this.filteredEndpoints.length === 0) {
            return [{
                id: 'no-results',
                label: this.searchQuery ? `未找到匹配 "${this.searchQuery}" 的结果` : '请输入搜索关键字',
                type: 'endpoint',
                endpoint: undefined
            }];
        }

        const totalCount = this.filteredEndpoints.length;
        const loadedCount = this.controllerLoadState.get('search') || 0;
        const batchSize = loadedCount === 0 ? this.INITIAL_ENDPOINT_BATCH : this.ENDPOINT_BATCH_SIZE;
        
        // 计算这次要显示的搜索结果
        const endIndex = Math.min(loadedCount + batchSize, totalCount);
        const currentBatch = this.filteredEndpoints.slice(0, endIndex);
        
        const nodes: TreeNode[] = currentBatch.map(endpoint => ({
            id: endpoint.id,
            label: `${endpoint.controllerClass.split('.').pop()}.${endpoint.methodName}`,
            type: 'endpoint' as const,
            endpoint
        }));
        
        // 如果还有更多搜索结果，添加"加载更多"节点
        if (endIndex < totalCount) {
            nodes.push({
                id: 'loadMore-search',
                label: `加载更多搜索结果... (${endIndex}/${totalCount})`,
                type: 'loadMore',
                metadata: {
                    loadedCount: endIndex,
                    totalCount,
                    batchSize: this.ENDPOINT_BATCH_SIZE
                }
            });
        }
        
        return nodes;
    }

    /**
     * 获取搜索状态节点（显示在TreeView顶部）
     */
    private getSearchStateNodes(): TreeNode[] {
        const nodes: TreeNode[] = [];
        
        if (this.searchQuery) {
            // 显示当前搜索状态
            nodes.push({
                id: 'search-current',
                label: `🔍 搜索: "${this.searchQuery}"`,
                type: 'searchState',
                metadata: { 
                    action: 'current',
                    query: this.searchQuery,
                    resultCount: this.filteredEndpoints.length
                }
            });
            
            // 编辑搜索
            nodes.push({
                id: 'search-edit',
                label: `✏️ 编辑搜索条件`,
                type: 'searchState',
                metadata: { action: 'edit' }
            });
            
            // 清除搜索
            nodes.push({
                id: 'search-clear',
                label: `❌ 清除搜索 (显示全部)`,
                type: 'searchState',
                metadata: { action: 'clear' }
            });
            
            // 分隔线
            nodes.push({
                id: 'search-separator',
                label: `────────────────────────`,
                type: 'searchState',
                metadata: { action: 'separator' }
            });
        } else {
            // 未搜索状态 - 显示搜索入口
            nodes.push({
                id: 'search-start',
                label: `🔍 点击开始搜索 API 端点`,
                type: 'searchState',
                metadata: { action: 'start' }
            });
        }
        
        return nodes;
    }

    /**
     * 格式化控制器名称
     */
    private formatControllerName(className: string): string {
        // 显示完整类名，不进行简化
        return className;
    }

    /**
     * 格式化端点标签
     */
    private formatEndpointLabel(endpoint: ApiEndpoint): string {
        return `[${endpoint.method}] ${endpoint.path}`;
    }

    /**
     * 获取 HTTP 方法图标
     */
    private getMethodIcon(method: HttpMethod): vscode.ThemeIcon {
        const themeIcon = IconConfig.getMethodThemeIcon(method);
        return new vscode.ThemeIcon(themeIcon);
    }

    /**
     * 获取方法排序优先级
     */
    private getMethodOrder(method: HttpMethod): number {
        return IconConfig.getMethodOrder(method);
    }

    /**
     * 创建端点提示信息
     */
    private createEndpointTooltip(endpoint: ApiEndpoint): string {
        const lines = [
            `**${endpoint.method} ${endpoint.path}**`,
            '',
            `**控制器:** ${endpoint.controllerClass}`,
            `**方法:** ${endpoint.methodName}`,
            ''
        ];

        // 添加路径组合信息
        if (endpoint.pathComposition.hasClassMapping) {
            lines.push(`**类路径:** ${endpoint.pathComposition.classPath}`);
        }
        if (endpoint.pathComposition.hasMethodMapping) {
            lines.push(`**方法路径:** ${endpoint.pathComposition.methodPath}`);
        }

        // 添加参数信息
        if (endpoint.parameters.length > 0) {
            lines.push('', '**参数:**');
            for (const param of endpoint.parameters) {
                const types = [];
                if (param.isPathVariable) types.push('PathVariable');
                if (param.isRequestParam) types.push('RequestParam');
                if (param.isRequestBody) types.push('RequestBody');
                
                const typeStr = types.length > 0 ? ` (${types.join(', ')})` : '';
                lines.push(`- ${param.name}: ${param.type}${typeStr}`);
            }
        }

        // 添加文件位置
        lines.push('', `**文件:** ${path.basename(endpoint.location.filePath)}`);
        lines.push(`**行号:** ${endpoint.location.startLine}-${endpoint.location.endLine}`);

        return lines.join('\n');
    }

    /**
     * 获取节点的父节点
     */
    getParent(element: TreeNode): vscode.ProviderResult<TreeNode> {
        if (element.type === 'endpoint' && element.endpoint) {
            // 端点的父节点是控制器
            return {
                id: element.endpoint.controllerClass,
                label: this.formatControllerName(element.endpoint.controllerClass),
                type: 'controller'
            };
        }
        return null;
    }

    /**
     * 解析树项上下文值
     */
    resolveTreeItem(item: vscode.TreeItem, element: TreeNode, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        return item;
    }

    // ==================== CACHE MANAGEMENT COMMANDS ====================

    /**
     * 清除缓存命令
     */
    public async clearCacheCommand(): Promise<void> {
        if (!this.cacheManager) {
            vscode.window.showWarningMessage('缓存管理器未初始化');
            return;
        }

        const choice = await vscode.window.showWarningMessage(
            '确定要清除所有缓存数据吗？下次启动时将重新索引。',
            { modal: true },
            '确定清除',
            '取消'
        );

        if (choice === '确定清除') {
            try {
                await this.cacheManager.clearCache();
                vscode.window.showInformationMessage('缓存已清除');
            } catch (error) {
                vscode.window.showErrorMessage(`清除缓存失败: ${error}`);
            }
        }
    }

    /**
     * 显示缓存信息命令
     */
    public async showCacheInfoCommand(): Promise<void> {
        if (!this.cacheManager) {
            vscode.window.showWarningMessage('缓存管理器未初始化');
            return;
        }

        try {
            const cacheInfo = await this.cacheManager.getCacheInfo();
            
            const infoLines = [
                '📊 缓存统计信息',
                '',
                '🎯 当前项目缓存:',
                cacheInfo.current ? 
                    `  • 端点数量: ${cacheInfo.current.endpoints.length}` :
                    '  • 无缓存数据',
                cacheInfo.current ? 
                    `  • 文件数量: ${cacheInfo.current.statistics.totalFiles}` : '',
                cacheInfo.current ?
                    `  • 缓存大小: ${Math.round(cacheInfo.current.statistics.cacheSize / 1024)}KB` : '',
                '',
                '⚡ 性能指标:',
                `  • 上次加载时间: ${cacheInfo.performance.lastLoadTime}ms`,
                `  • 上次刷新时间: ${cacheInfo.performance.lastRefreshTime}ms`,
                `  • 缓存命中率: ${Math.round(cacheInfo.performance.cacheHitRate * 100)}%`,
                '',
                '🌍 全局缓存:',
                `  • 缓存文件数: ${cacheInfo.global.totalCaches}`,
                `  • 总大小: ${Math.round(cacheInfo.global.totalSize / 1024)}KB`
            ].filter(line => line !== '').join('\n');

            await vscode.window.showInformationMessage(infoLines, { modal: true });
            
        } catch (error) {
            vscode.window.showErrorMessage(`获取缓存信息失败: ${error}`);
        }
    }

    /**
     * 手动刷新缓存命令
     */
    public async manualRefreshCommand(): Promise<void> {
        if (!this.cacheManager) {
            vscode.window.showWarningMessage('缓存管理器未初始化');
            return;
        }

        try {
            // 显示开始刷新的消息
            vscode.window.setStatusBarMessage('🔄 正在重新索引API端点...', 2000);
            await this.cacheManager.manualRefresh();
            // 完成消息会由缓存管理器的状态监听器自动显示
        } catch (error) {
            vscode.window.showErrorMessage(`重新索引失败: ${error}`);
        }
    }

    /**
     * 获取缓存管理器（供外部使用）
     */
    public getCacheManager(): any {
        return this.cacheManager;
    }

    /**
     * 设置缓存管理器（供外部使用）
     */
    public setCacheManager(cacheManager: any): void {
        this.cacheManager = cacheManager;
        this.setupCacheStatusListeners();
    }
} 