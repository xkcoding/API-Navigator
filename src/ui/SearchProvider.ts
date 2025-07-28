import * as vscode from 'vscode';
import { ApiIndexer } from '../core/ApiIndexer';
import { ApiEndpoint, HttpMethod, SearchFilters, SearchOptions } from '../core/types';
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

    /**
     * 显示高级搜索面板
     */
    public async showAdvancedSearch(): Promise<void> {
        // 创建多步骤输入向导
        const advancedSearchWizard = new AdvancedSearchWizard(this.apiIndexer);
        await advancedSearchWizard.start();
    }
}

/**
 * 高级搜索向导类
 */
class AdvancedSearchWizard {
    private filters: SearchFilters = {};
    private options: SearchOptions = { caseSensitive: false, useRegex: false };

    constructor(private apiIndexer: ApiIndexer) {}

    /**
     * 启动高级搜索向导
     */
    public async start(): Promise<void> {
        // 步骤1: 选择搜索类型
        const searchType = await this.selectSearchType();
        if (!searchType) return;

        switch (searchType) {
            case 'text':
                await this.configureTextSearch();
                break;
            case 'method':
                await this.configureMethodFilter();
                break;
            case 'path':
                await this.configurePathFilter();
                break;
            case 'advanced':
                await this.configureAdvancedFilters();
                break;
        }

        // 执行搜索并显示结果
        await this.executeSearch();
    }

    /**
     * 选择搜索类型
     */
    private async selectSearchType(): Promise<string | undefined> {
        const items = [
            {
                label: '$(search) 文本搜索',
                description: '在路径、控制器、方法名中搜索文本',
                detail: '支持模糊匹配，适合快速查找',
                value: 'text'
            },
            {
                label: '$(symbol-method) HTTP方法过滤',
                description: '按HTTP方法筛选端点',
                detail: 'GET, POST, PUT, DELETE, PATCH等',
                value: 'method'
            },
            {
                label: '$(file-directory) 路径模式匹配',
                description: '使用通配符或正则匹配路径',
                detail: '支持 * 通配符和正则表达式',
                value: 'path'
            },
            {
                label: '$(settings-gear) 高级组合搜索',
                description: '组合多种搜索条件',
                detail: '同时使用多个过滤器进行精确查找',
                value: 'advanced'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择搜索类型',
            ignoreFocusOut: true
        });

        return selected?.value;
    }

    /**
     * 配置文本搜索
     */
    private async configureTextSearch(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: '输入搜索文本',
            placeHolder: '例如: user, UserController, findById',
            ignoreFocusOut: true
        });

        if (query) {
            this.filters.query = query;
            
            // 询问是否区分大小写
            const caseSensitive = await vscode.window.showQuickPick(
                [
                    { label: '不区分大小写', value: false },
                    { label: '区分大小写', value: true }
                ],
                { placeHolder: '选择大小写敏感性' }
            );

            if (caseSensitive) {
                this.options.caseSensitive = caseSensitive.value;
            }
        }
    }

    /**
     * 配置HTTP方法过滤
     */
    private async configureMethodFilter(): Promise<void> {
        const availableMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
        const items = availableMethods.map(method => ({
            label: method,
            description: this.getMethodDescription(method)
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择HTTP方法 (支持多选)',
            canPickMany: true,
            ignoreFocusOut: true
        });

        if (selected && selected.length > 0) {
            this.filters.methods = selected.map(item => item.label);
        }
    }

    /**
     * 配置路径过滤
     */
    private async configurePathFilter(): Promise<void> {
        const pattern = await vscode.window.showInputBox({
            prompt: '输入路径模式',
            placeHolder: '例如: /api/users/*, /api/v*/users, ^/api/users/\\d+$',
            value: '/api/*',
            ignoreFocusOut: true
        });

        if (pattern) {
            this.filters.pathPattern = pattern;

            // 询问是否使用正则表达式
            const useRegex = await vscode.window.showQuickPick(
                [
                    { label: '通配符匹配 (*)', description: '简单的通配符匹配，适合大部分场景', value: false },
                    { label: '正则表达式', description: '完整的正则表达式支持，更强大但需要技术背景', value: true }
                ],
                { placeHolder: '选择匹配模式' }
            );

            if (useRegex) {
                this.options.useRegex = useRegex.value;
            }
        }
    }

    /**
     * 配置高级组合过滤器
     */
    private async configureAdvancedFilters(): Promise<void> {
        // 这里可以实现一个更复杂的多步骤配置
        await vscode.window.showInformationMessage(
            '高级搜索功能开发中，敬请期待！\n当前可使用其他搜索类型。',
            { modal: true }
        );
    }

    /**
     * 执行搜索并显示结果
     */
    private async executeSearch(): Promise<void> {
        if (Object.keys(this.filters).length === 0) {
            await vscode.window.showWarningMessage('未设置任何搜索条件');
            return;
        }

        try {
            const startTime = Date.now();
            const results = this.apiIndexer.searchEndpointsAdvanced(this.filters, this.options);
            const duration = Date.now() - startTime;

            if (results.length === 0) {
                await vscode.window.showInformationMessage('未找到匹配的API端点');
                return;
            }

            // 创建搜索结果快速选择器
            const quickPick = vscode.window.createQuickPick();
            quickPick.title = `搜索结果 (${results.length} 个, ${duration}ms)`;
            quickPick.placeholder = '选择要查看的API端点';
            quickPick.items = this.createResultItems(results);

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected && 'endpoint' in selected) {
                    this.navigateToEndpoint((selected as any).endpoint);
                }
                quickPick.dispose();
            });

            quickPick.show();

        } catch (error) {
            console.error('搜索执行失败:', error);
            await vscode.window.showErrorMessage(`搜索失败: ${error}`);
        }
    }

    /**
     * 创建搜索结果项目
     */
    private createResultItems(endpoints: ApiEndpoint[]): vscode.QuickPickItem[] {
        return endpoints.map(endpoint => ({
            label: `$(symbol-method) ${endpoint.method} ${endpoint.path}`,
            description: endpoint.controllerClass,
            detail: `${endpoint.methodName} - ${endpoint.location.filePath || ''}`,
            endpoint: endpoint
        } as any));
    }

    /**
     * 导航到端点定义
     */
    private async navigateToEndpoint(endpoint: ApiEndpoint): Promise<void> {
        if (!endpoint.location.filePath) {
            await vscode.window.showWarningMessage('无法定位到源代码文件');
            return;
        }

        try {
            const document = await vscode.workspace.openTextDocument(endpoint.location.filePath);
            const editor = await vscode.window.showTextDocument(document);
            
            if (endpoint.location.startLine && endpoint.location.startLine > 0) {
                const position = new vscode.Position(endpoint.location.startLine - 1, endpoint.location.startColumn || 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position), 
                    vscode.TextEditorRevealType.InCenter
                );
            }
        } catch (error) {
            console.error('导航失败:', error);
            await vscode.window.showErrorMessage(`无法打开文件: ${endpoint.location.filePath}`);
        }
    }

    /**
     * 获取HTTP方法描述
     */
    private getMethodDescription(method: string): string {
        const descriptions: Record<string, string> = {
            'GET': '获取资源',
            'POST': '创建资源',
            'PUT': '完整更新资源',
            'PATCH': '部分更新资源',
            'DELETE': '删除资源',
            'HEAD': '获取响应头',
            'OPTIONS': '获取支持的方法'
        };
        return descriptions[method] || '其他操作';
    }
} 