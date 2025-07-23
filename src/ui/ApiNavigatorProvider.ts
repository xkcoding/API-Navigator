import * as vscode from 'vscode';
import * as path from 'path';
import { ApiIndexer } from '../core/ApiIndexer';
import { ApiEndpoint, HttpMethod } from '../core/types';

interface TreeNode {
    id: string;
    label: string;
    type: 'controller' | 'endpoint';
    endpoint?: ApiEndpoint;
    children?: TreeNode[];
}

export class ApiNavigatorProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

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
        this._onDidChangeTreeData.fire();
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
            
            // 设置描述信息
            item.description = endpoint.path;
            item.tooltip = this.createEndpointTooltip(endpoint);
            
            // 设置点击命令
            item.command = {
                command: 'apiNavigator.openApi',
                title: 'Open API',
                arguments: [endpoint]
            };
            
            item.contextValue = 'endpoint';
            return item;
        }

        return new vscode.TreeItem('Unknown');
    }

    /**
     * 获取子节点
     */
    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            // 根节点：返回控制器分组
            return Promise.resolve(this.getControllerNodes());
        } else if (element.type === 'controller') {
            // 控制器节点：返回该控制器的端点
            return Promise.resolve(this.getEndpointNodes(element.id));
        }
        
        return Promise.resolve([]);
    }

    /**
     * 获取控制器节点
     */
    private getControllerNodes(): TreeNode[] {
        const controllerClasses = this.apiIndexer.getAllControllerClasses();
        
        return controllerClasses.map(className => ({
            id: className,
            label: this.formatControllerName(className),
            type: 'controller' as const,
            children: []
        }));
    }

    /**
     * 获取端点节点
     */
    private getEndpointNodes(controllerClass: string): TreeNode[] {
        const endpoints = this.apiIndexer.findByController(controllerClass);
        
        // 按 HTTP 方法和路径排序
        endpoints.sort((a, b) => {
            if (a.method !== b.method) {
                return this.getMethodOrder(a.method) - this.getMethodOrder(b.method);
            }
            return a.path.localeCompare(b.path);
        });

        return endpoints.map(endpoint => ({
            id: endpoint.id,
            label: endpoint.methodName,
            type: 'endpoint' as const,
            endpoint
        }));
    }

    /**
     * 格式化控制器名称
     */
    private formatControllerName(className: string): string {
        // 移除 Controller 后缀并添加友好显示
        const name = className.replace(/Controller$/, '');
        return name || className;
    }

    /**
     * 格式化端点标签
     */
    private formatEndpointLabel(endpoint: ApiEndpoint): string {
        return `${endpoint.methodName}`;
    }

    /**
     * 获取 HTTP 方法图标
     */
    private getMethodIcon(method: HttpMethod): vscode.ThemeIcon {
        const iconMap: Record<HttpMethod, string> = {
            GET: 'symbol-method',     // 绿色方法图标
            POST: 'symbol-constructor', // 蓝色构造函数图标
            PUT: 'symbol-property',   // 橙色属性图标
            DELETE: 'symbol-operator', // 红色操作符图标
            PATCH: 'symbol-event'     // 紫色事件图标
        };

        return new vscode.ThemeIcon(iconMap[method] || 'symbol-method');
    }

    /**
     * 获取方法排序优先级
     */
    private getMethodOrder(method: HttpMethod): number {
        const order: Record<HttpMethod, number> = {
            GET: 1,
            POST: 2,
            PUT: 3,
            PATCH: 4,
            DELETE: 5
        };
        return order[method] || 999;
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