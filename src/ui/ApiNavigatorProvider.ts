import * as vscode from 'vscode';
import * as path from 'path';
import { ApiIndexer } from '../core/ApiIndexer';
import { ApiEndpoint, HttpMethod } from '../core/types';
import { IconConfig } from './IconConfig';

interface TreeNode {
    id: string;
    label: string;
    type: 'controller' | 'endpoint' | 'loading' | 'loadMore';
    endpoint?: ApiEndpoint;
    children?: TreeNode[];
    metadata?: {
        controllerClass?: string;
        loadedCount?: number;
        totalCount?: number;
        batchSize?: number;
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

    // 搜索状态
    private searchQuery: string = '';
    private filteredEndpoints: ApiEndpoint[] = [];

    constructor(private apiIndexer: ApiIndexer) {
        // 监听索引器的变化
        this.setupIndexerListeners();
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
     * 刷新树视图
     */
    public refresh(): void {
        // 重置分批加载状态
        this.controllerLoadState.clear();
        this.endpointLoadState.clear();
        this._onDidChangeTreeData.fire();
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
        if (this.loadingStates.get('controllers')) return; // 防止重复加载
        
        this.loadingStates.set('controllers', true);
        const currentLoaded = this.controllerLoadState.get('root') || this.INITIAL_CONTROLLER_BATCH;
        const controllerClasses = this.apiIndexer.getAllControllerClasses();
        
        if (currentLoaded < controllerClasses.length) {
            // 延迟加载，给用户更好的体验
            setTimeout(() => {
                this.controllerLoadState.set('root', currentLoaded + this.CONTROLLER_BATCH_SIZE);
                this.loadingStates.set('controllers', false);
                this._onDidChangeTreeData.fire();
                
                // 如果还有更多数据，继续自动加载
                if (this.controllerLoadState.get('root')! < controllerClasses.length) {
                    setTimeout(() => this.autoLoadMoreControllers(), this.AUTO_LOAD_DELAY);
                }
            }, this.AUTO_LOAD_DELAY);
        } else {
            this.loadingStates.set('controllers', false);
        }
    }

    /**
     * 自动异步加载更多端点
     */
    private async autoLoadMoreEndpoints(controllerClass: string): Promise<void> {
        const loadingKey = `endpoints-${controllerClass}`;
        if (this.loadingStates.get(loadingKey)) return; // 防止重复加载
        
        this.loadingStates.set(loadingKey, true);
        const currentLoaded = this.endpointLoadState.get(controllerClass) || this.INITIAL_ENDPOINT_BATCH;
        const endpoints = this.apiIndexer.findByController(controllerClass);
        
        if (currentLoaded < endpoints.length) {
            setTimeout(() => {
                this.endpointLoadState.set(controllerClass, currentLoaded + this.ENDPOINT_BATCH_SIZE);
                this.loadingStates.set(loadingKey, false);
                this._onDidChangeTreeData.fire();
                
                // 如果还有更多数据，继续自动加载
                if (this.endpointLoadState.get(controllerClass)! < endpoints.length) {
                    setTimeout(() => this.autoLoadMoreEndpoints(controllerClass), this.AUTO_LOAD_DELAY);
                }
            }, this.AUTO_LOAD_DELAY);
        } else {
            this.loadingStates.set(loadingKey, false);
        }
    }

    /**
     * 自动异步加载更多搜索结果
     */
    private async autoLoadMoreSearchResults(): Promise<void> {
        if (this.loadingStates.get('search')) return; // 防止重复加载
        
        this.loadingStates.set('search', true);
        const currentLoaded = this.endpointLoadState.get('search') || this.INITIAL_ENDPOINT_BATCH;
        
        if (currentLoaded < this.filteredEndpoints.length) {
            setTimeout(() => {
                this.endpointLoadState.set('search', currentLoaded + this.ENDPOINT_BATCH_SIZE);
                this.loadingStates.set('search', false);
                this._onDidChangeTreeData.fire();
                
                // 如果还有更多数据，继续自动加载
                if (this.endpointLoadState.get('search')! < this.filteredEndpoints.length) {
                    setTimeout(() => this.autoLoadMoreSearchResults(), this.AUTO_LOAD_DELAY);
                }
            }, this.AUTO_LOAD_DELAY);
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
        }

        return new vscode.TreeItem('Unknown');
    }

    /**
     * 获取子节点
     */
    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            if (this.isSearchMode()) {
                // 搜索模式：直接返回扁平化的搜索结果
                return Promise.resolve(this.getSearchResultNodes());
            } else {
                // 正常模式：返回控制器分组
                return Promise.resolve(this.getControllerNodes());
            }
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
        const totalCount = controllerClasses.length;
        
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
} 