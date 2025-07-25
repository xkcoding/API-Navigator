import * as vscode from 'vscode';
import { ApiIndexer } from '../core/ApiIndexer';
import { ApiEndpoint, HttpMethod } from '../core/types';
import { IconConfig } from './IconConfig';
import { StatisticsWebView } from './StatisticsWebView';

interface ApiQuickPickItem extends vscode.QuickPickItem {
    endpoint: ApiEndpoint;
}

export class SearchProvider {
    private statisticsWebView: StatisticsWebView;

    constructor(private apiIndexer: ApiIndexer, extensionUri: vscode.Uri) {
        this.statisticsWebView = new StatisticsWebView(extensionUri, apiIndexer);
    }

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
        return IconConfig.getMethodThemeIcon(method);
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
        this.statisticsWebView.show();
    }

    /**
     * 显示统计信息（旧版本，保留作为备用）
     */
    public async showStatisticsLegacy(): Promise<void> {
        const stats = this.apiIndexer.getStatistics();
        const controllers = this.apiIndexer.getAllControllerClasses();
        const endpoints = this.apiIndexer.getAllEndpoints();
        
        if (endpoints.length === 0) {
            vscode.window.showInformationMessage(
                '🔍 未找到任何 API 端点\n\n请确保项目包含带有 @RestController 或 @Controller 注解的 Java 文件。', 
                { modal: true }
            );
            return;
        }
        
        // 计算控制器端点分布
        const controllerEndpointCounts = new Map<string, number>();
        endpoints.forEach(endpoint => {
            const count = controllerEndpointCounts.get(endpoint.controllerClass) || 0;
            controllerEndpointCounts.set(endpoint.controllerClass, count + 1);
        });
        
        const endpointCounts = Array.from(controllerEndpointCounts.values());
        const avgEndpointsPerController = endpointCounts.length > 0 
            ? (endpointCounts.reduce((a, b) => a + b, 0) / endpointCounts.length).toFixed(1)
            : '0';
        
        // 控制器排行榜
        const controllerRanking = Array.from(controllerEndpointCounts.entries())
            .map(([name, count]) => ({
                name: name.split('.').pop() || name, // 只显示类名
                fullName: name,
                count
            }))
            .sort((a, b) => b.count - a.count);
        
        // 统计路径模式（分析前缀）
        const pathPatterns = new Map<string, number>();
        endpoints.forEach(endpoint => {
            const parts = endpoint.path.split('/').filter(p => p && !p.startsWith('{') && !p.match(/^\d+$/));
            parts.forEach(part => {
                const count = pathPatterns.get(part) || 0;
                pathPatterns.set(part, count + 1);
            });
        });
        
        const topPatterns = Array.from(pathPatterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        // 分析端点复杂度
        const paramEndpoints = endpoints.filter(ep => ep.path.includes('{')).length;
        const staticEndpoints = endpoints.length - paramEndpoints;
        
        // 分析最复杂的端点
        const complexEndpoints = endpoints
            .map(ep => ({
                ...ep,
                complexity: ep.path.split('/').length - 1,
                hasParams: ep.path.includes('{')
            }))
            .sort((a, b) => b.complexity - a.complexity)
            .slice(0, 2);

        // 构建简洁易读的统计报告
        const formatSection = (title: string, data: Array<[string, string]>) => {
            const lines = [
                `${title}`
            ];
            
            data.forEach(([label, value]) => {
                lines.push(`  ${label}: ${value}`);
            });
            
            return lines;
        };

        // 总体概况
        const overviewData: Array<[string, string]> = [
            ['总端点数量', `${stats.totalEndpoints} 个`],
            ['控制器数量', `${stats.controllerCount} 个`],
            ['平均端点密度', `${avgEndpointsPerController} 个/控制器`],
            ['参数化端点', `${paramEndpoints} 个 (${Math.round(paramEndpoints / stats.totalEndpoints * 100)}%)`],
            ['静态端点', `${staticEndpoints} 个 (${Math.round(staticEndpoints / stats.totalEndpoints * 100)}%)`]
        ];

        // HTTP方法分布
        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
        const methodData: Array<[string, string]> = methods.map(method => {
            const count = stats.methodCounts[method as keyof typeof stats.methodCounts] || 0;
            const percentage = ((count / stats.totalEndpoints) * 100).toFixed(1);
            return [`${method}`, `${count} 个 (${percentage}%)`];
        });

        // 控制器排行榜
        const controllerData: Array<[string, string]> = controllerRanking.slice(0, 5).map((ctrl, index) => {
            const medals = ['🥇', '🥈', '🥉', '🏅', '⭐'];
            const medal = medals[index] || '📌';
            const name = ctrl.name.length > 18 ? ctrl.name.substring(0, 15) + '...' : ctrl.name;
            return [`${medal} ${name}`, `${ctrl.count} 个端点`];
        });

        // 路径前缀
        const pathData: Array<[string, string]> = topPatterns.slice(0, 3).map(([pattern, count], index) => {
            const icons = ['🔥', '⭐', '💫'];
            const icon = icons[index] || '📌';
            return [`${icon} /${pattern}`, `${count} 个端点`];
        });

        let reportContent = [
            `📊 API Navigator 统计报告`,
            ``,
            ...formatSection(`📈 总体概况`, overviewData),
            ``,
            ...formatSection(`🔗 HTTP 方法分布`, methodData),
        ];

        if (controllerData.length > 0) {
            reportContent.push(
                ``,
                ...formatSection(`🏛️ 控制器排行榜`, controllerData)
            );
        }

        if (pathData.length > 0) {
            reportContent.push(
                ``,
                ...formatSection(`🛤️ 热门路径前缀`, pathData)
            );
        }

        reportContent.push(
            ``,
            `📋 快速操作提示`,
            `  CMD+\\ 快速搜索端点`,
            `  点击端点直接跳转代码`,
            `  搜索框支持路径、方法名过滤`,
            ``,
            `🔄 统计时间: ${new Date().toLocaleString('zh-CN')}`
        );

        vscode.window.showInformationMessage(
            reportContent.join('\n'),
            { modal: true }
        );
    }
} 