import * as vscode from 'vscode';
import { ApiIndexer } from '../core/ApiIndexer';
import { ApiEndpoint, HttpMethod } from '../core/types';

interface ApiQuickPickItem extends vscode.QuickPickItem {
    endpoint: ApiEndpoint;
}

export class SearchProvider {
    constructor(private apiIndexer: ApiIndexer) {}

    /**
     * 显示快速搜索面板
     */
    public async showQuickPick(): Promise<void> {
        const quickPick = vscode.window.createQuickPick<ApiQuickPickItem>();
        
        // 配置快速搜索面板
        quickPick.placeholder = '搜索 API 端点... (输入路径、控制器名或方法名)';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        
        // 初始显示所有端点
        quickPick.items = this.createQuickPickItems(this.apiIndexer.getAllEndpoints());
        
        // 监听输入变化
        quickPick.onDidChangeValue(value => {
            if (value.trim()) {
                const results = this.apiIndexer.searchEndpoints(value);
                quickPick.items = this.createQuickPickItems(results);
            } else {
                quickPick.items = this.createQuickPickItems(this.apiIndexer.getAllEndpoints());
            }
        });

        // 监听选择
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (selected) {
                this.openEndpoint(selected.endpoint);
            }
            quickPick.dispose();
        });

        // 监听取消
        quickPick.onDidHide(() => {
            quickPick.dispose();
        });

        quickPick.show();
    }

    /**
     * 创建快速搜索项
     */
    private createQuickPickItems(endpoints: ApiEndpoint[]): ApiQuickPickItem[] {
        return endpoints.map(endpoint => {
            const methodIcon = this.getMethodIcon(endpoint.method);
            
            return {
                label: `$(${methodIcon}) ${endpoint.method} ${endpoint.path}`,
                description: `${endpoint.controllerClass}.${endpoint.methodName}`,
                detail: this.createEndpointDetail(endpoint),
                endpoint
            };
        });
    }

    /**
     * 获取方法图标
     */
    private getMethodIcon(method: HttpMethod): string {
        const iconMap: Record<HttpMethod, string> = {
            GET: 'arrow-down',        // 下载图标 (GET)
            POST: 'plus',             // 加号图标 (POST)
            PUT: 'pencil',            // 编辑图标 (PUT)
            DELETE: 'trash',          // 删除图标 (DELETE)
            PATCH: 'diff-modified'    // 修改图标 (PATCH)
        };
        return iconMap[method] || 'circle-outline';
    }

    /**
     * 创建端点详情
     */
    private createEndpointDetail(endpoint: ApiEndpoint): string {
        const details = [];
        
        // 添加文件信息
        const fileName = endpoint.location.filePath.split('/').pop() || '';
        details.push(`📁 ${fileName}:${endpoint.location.startLine}`);
        
        // 添加参数信息
        if (endpoint.parameters.length > 0) {
            const paramTypes = endpoint.parameters.map(p => {
                const types = [];
                if (p.isPathVariable) types.push('Path');
                if (p.isRequestParam) types.push('Param');
                if (p.isRequestBody) types.push('Body');
                return types.length > 0 ? `${p.name}(${types.join(',')})` : p.name;
            });
            details.push(`📋 ${paramTypes.join(', ')}`);
        }
        
        return details.join(' • ');
    }

    /**
     * 打开端点位置
     */
    private async openEndpoint(endpoint: ApiEndpoint): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(endpoint.location.filePath);
            const editor = await vscode.window.showTextDocument(document);
            
            // 跳转到指定行
            const position = new vscode.Position(
                Math.max(0, endpoint.location.startLine - 1), 
                endpoint.location.startColumn
            );
            const range = new vscode.Range(position, position);
            
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            
            // 显示成功信息
            vscode.window.setStatusBarMessage(
                `已跳转到 ${endpoint.method} ${endpoint.path}`,
                3000
            );
            
        } catch (error) {
            console.error('打开端点失败:', error);
            vscode.window.showErrorMessage(`无法打开端点: ${error}`);
        }
    }

    /**
     * 显示按方法过滤的搜索
     */
    public async showMethodFilter(): Promise<void> {
        const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
        
        const selectedMethod = await vscode.window.showQuickPick(
            methods.map(method => ({
                label: `$(${this.getMethodIcon(method)}) ${method}`,
                description: `显示所有 ${method} 请求`,
                method
            })),
            {
                placeHolder: '选择要过滤的 HTTP 方法'
            }
        );

        if (selectedMethod) {
            const endpoints = this.apiIndexer.findByMethod(selectedMethod.method);
            if (endpoints.length === 0) {
                vscode.window.showInformationMessage(`未找到 ${selectedMethod.method} 类型的端点`);
                return;
            }

            const quickPick = vscode.window.createQuickPick<ApiQuickPickItem>();
            quickPick.title = `${selectedMethod.method} 端点 (${endpoints.length} 个)`;
            quickPick.items = this.createQuickPickItems(endpoints);

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected) {
                    this.openEndpoint(selected.endpoint);
                }
                quickPick.dispose();
            });

            quickPick.onDidHide(() => {
                quickPick.dispose();
            });

            quickPick.show();
        }
    }

    /**
     * 显示按控制器过滤的搜索
     */
    public async showControllerFilter(): Promise<void> {
        const controllers = this.apiIndexer.getAllControllerClasses();
        
        if (controllers.length === 0) {
            vscode.window.showInformationMessage('未找到任何控制器');
            return;
        }

        const selectedController = await vscode.window.showQuickPick(
            controllers.map(controller => ({
                label: `$(symbol-class) ${controller}`,
                description: `查看 ${controller} 的所有端点`,
                controller
            })),
            {
                placeHolder: '选择要查看的控制器'
            }
        );

        if (selectedController) {
            const endpoints = this.apiIndexer.findByController(selectedController.controller);
            
            const quickPick = vscode.window.createQuickPick<ApiQuickPickItem>();
            quickPick.title = `${selectedController.controller} 端点 (${endpoints.length} 个)`;
            quickPick.items = this.createQuickPickItems(endpoints);

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected) {
                    this.openEndpoint(selected.endpoint);
                }
                quickPick.dispose();
            });

            quickPick.onDidHide(() => {
                quickPick.dispose();
            });

            quickPick.show();
        }
    }

    /**
     * 显示统计信息
     */
    public async showStatistics(): Promise<void> {
        const stats = this.apiIndexer.getStatistics();
        
        const items = [
            `📊 总端点数: ${stats.totalEndpoints}`,
            `🏛️ 控制器数: ${stats.controllerCount}`,
            '',
            '📈 HTTP 方法分布:',
            `  GET: ${stats.methodCounts.GET}`,
            `  POST: ${stats.methodCounts.POST}`,
            `  PUT: ${stats.methodCounts.PUT}`,
            `  DELETE: ${stats.methodCounts.DELETE}`,
            `  PATCH: ${stats.methodCounts.PATCH}`
        ];

        vscode.window.showInformationMessage(
            items.join('\n'),
            { modal: true }
        );
    }
} 