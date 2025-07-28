import * as vscode from 'vscode';
import { ApiIndexer } from '../core/ApiIndexer';

/**
 * 统计信息WebView
 */
export class StatisticsWebView {
    private panel?: vscode.WebviewPanel;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly apiIndexer: ApiIndexer
    ) {}

    public show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'apiNavigatorStatistics',
            'API Navigator 统计信息',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.extensionUri, 'images', 'icon.png'),
            dark: vscode.Uri.joinPath(this.extensionUri, 'images', 'icon.png')
        };

        this.panel.webview.html = this.getWebviewContent();

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 监听来自WebView的消息
        this.panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'refresh':
                    // 重新生成并更新WebView内容
                    if (this.panel) {
                        this.panel.webview.html = this.getWebviewContent();
                        // 显示刷新成功的状态消息
                        vscode.window.setStatusBarMessage('📊 统计信息已刷新', 2000);
                    }
                    break;
            }
        });
    }

    private getWebviewContent(): string {
        const stats = this.apiIndexer.getStatistics();
        const controllers = this.apiIndexer.getAllControllerClasses();
        const endpoints = this.apiIndexer.getAllEndpoints();

        if (endpoints.length === 0) {
            return this.getEmptyStateHtml();
        }

        // 计算统计数据
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
                name: name.split('.').pop() || name,
                fullName: name,
                count
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // HTTP方法统计
        const methodStats = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(method => ({
            method,
            count: stats.methodCounts[method as keyof typeof stats.methodCounts] || 0,
            percentage: ((stats.methodCounts[method as keyof typeof stats.methodCounts] || 0) / stats.totalEndpoints * 100).toFixed(1)
        }));

        // 统计路径模式
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

        const paramEndpoints = endpoints.filter(ep => ep.path.includes('{')).length;
        const staticEndpoints = endpoints.length - paramEndpoints;

        // 获取样式和脚本的URI
        const stylesUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'vscode.css')
        );
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel!.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${this.panel!.webview.cspSource};">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${stylesUri}" rel="stylesheet">
            <script nonce="${nonce}" 
                    src="${this.panel!.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chart.min.js'))}"
                    onload="console.log('✅ Chart.js 脚本加载成功'); window.chartLoaded = true;"
                    onerror="console.error('❌ Chart.js 脚本加载失败'); window.chartLoadError = true;"></script>
            <title>API Navigator 统计信息</title>
            <style>
                html, body {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100vh;
                    overflow-x: hidden;
                    overflow-y: auto;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    line-height: 1.6;
                }
                
                .main-container {
                    padding: 20px;
                    min-height: 100vh;
                    box-sizing: border-box;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .header h1 {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    margin: 0;
                    font-size: 24px;
                    color: var(--vscode-foreground);
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .stat-card {
                    background: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-sideBar-border);
                    border-radius: 8px;
                    padding: 20px;
                }
                .stat-card h3 {
                    margin: 0 0 15px 0;
                    font-size: 16px;
                    color: var(--vscode-foreground);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .stat-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid var(--vscode-sideBar-border);
                }
                .stat-item:last-child {
                    border-bottom: none;
                }
                .stat-label {
                    font-size: 14px;
                    color: var(--vscode-descriptionForeground);
                }
                .stat-value {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--vscode-foreground);
                }
                .method-bar {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .method-tag {
                    font-size: 10px;
                    font-weight: 600;
                    padding: 3px 8px;
                    border-radius: 3px;
                    text-transform: uppercase;
                    min-width: 45px;
                    text-align: center;
                }
                .method-tag.GET { background: #28a745; color: white; }
                .method-tag.POST { background: #007bff; color: white; }
                .method-tag.PUT { background: #ffc107; color: black; }
                .method-tag.DELETE { background: #dc3545; color: white; }
                .method-tag.PATCH { background: #6f42c1; color: white; }
                .controller-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 0;
                    border-bottom: 1px solid var(--vscode-sideBar-border);
                }
                .controller-item:last-child {
                    border-bottom: none;
                }
                .controller-name {
                    font-size: 14px;
                    color: var(--vscode-foreground);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .controller-count {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 4px 8px;
                    border-radius: 10px;
                }
                .path-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid var(--vscode-sideBar-border);
                }
                .path-item:last-child {
                    border-bottom: none;
                }
                .path-pattern {
                    font-family: var(--vscode-editor-font-family);
                    font-size: 14px;
                    color: var(--vscode-textLink-foreground);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .refresh-btn {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 20px;
                    padding: 10px 15px;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .refresh-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .refresh-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    background: var(--vscode-button-secondaryBackground);
                }
                .tips {
                    background: var(--vscode-textBlockQuote-background);
                    border-left: 3px solid var(--vscode-textBlockQuote-border);
                    padding: 15px;
                    margin-top: 20px;
                    border-radius: 4px;
                }
                .tips h4 {
                    margin: 0 0 10px 0;
                    color: var(--vscode-foreground);
                }
                .tips ul {
                    margin: 0;
                    padding-left: 20px;
                }
                .tips li {
                    margin: 5px 0;
                    color: var(--vscode-descriptionForeground);
                }
                
                /* 概念说明模块样式 */
                .concept-section {
                    background-color: var(--vscode-editor-selectionBackground, rgba(255, 255, 255, 0.1));
                    border: 1px solid var(--vscode-panel-border, #404040);
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                }
                
                .concept-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                    user-select: none;
                }
                
                .concept-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: var(--vscode-textLink-foreground);
                    margin: 0;
                }
                
                .toggle-icon {
                    font-size: 14px;
                    transition: transform 0.2s ease;
                }
                
                .concept-content {
                    margin-top: 15px;
                    overflow: hidden;
                    transition: max-height 0.3s ease;
                }
                
                .concept-content.collapsed {
                    max-height: 0;
                    margin-top: 0;
                }
                
                .concept-item {
                    background-color: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
                    border-left: 4px solid var(--vscode-textLink-foreground);
                    padding: 15px;
                    margin: 10px 0;
                    border-radius: 4px;
                }
                
                .concept-name {
                    font-weight: 600;
                    color: var(--vscode-symbolIcon-classForeground);
                    margin-bottom: 8px;
                }
                
                .concept-description {
                    color: var(--vscode-foreground);
                    margin-bottom: 10px;
                }
                
                .concept-example {
                    background-color: var(--vscode-textCodeBlock-background, rgba(255, 255, 255, 0.1));
                    border: 1px solid var(--vscode-textBlockQuote-border, #606060);
                    border-radius: 4px;
                    padding: 10px;
                    font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
                    font-size: 13px;
                    color: var(--vscode-textPreformat-foreground);
                }
                
                .tip-section {
                    background-color: var(--vscode-editorInfo-background, rgba(77, 166, 255, 0.1));
                    border: 1px solid var(--vscode-editorInfo-border, #4da6ff);
                    border-radius: 6px;
                    padding: 15px;
                    margin: 15px 0;
                }
                
                .tip-title {
                    display: flex;
                    align-items: center;
                    font-weight: 600;
                    color: var(--vscode-editorInfo-foreground);
                    margin-bottom: 8px;
                }
                
                .stats-comparison {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin: 15px 0;
                }
                
                .stat-box {
                    background-color: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.1));
                    border: 1px solid var(--vscode-button-border, #606060);
                    border-radius: 4px;
                    padding: 12px;
                    text-align: center;
                }
                
                .stat-number {
                    font-size: 24px;
                    font-weight: 700;
                    color: var(--vscode-textLink-foreground);
                }
                
                .stat-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 4px;
                }

                /* 图表区域样式 */
                .charts-section {
                    margin: 40px 0;
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 8px;
                }

                .charts-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                    gap: 30px;
                    margin-top: 20px;
                }

                .chart-container {
                    background-color: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
                    border: 1px solid var(--vscode-panel-border, #404040);
                    border-radius: 8px;
                    padding: 20px;
                    text-align: center;
                }

                .chart-container h3 {
                    margin: 0 0 15px 0;
                    color: var(--vscode-textLink-foreground);
                    font-size: 16px;
                    font-weight: 600;
                }

                .chart-wrapper {
                    position: relative;
                    height: 300px;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .chart-wrapper canvas {
                    max-width: 100%;
                    max-height: 100%;
                }

                /* 响应式调整 */
                @media (max-width: 1200px) {
                    .charts-grid {
                        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                        gap: 20px;
                    }
                }

                @media (max-width: 800px) {
                    .charts-grid {
                        grid-template-columns: 1fr;
                        gap: 15px;
                    }
                    
                    .chart-container {
                        padding: 15px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="main-container">
                <div class="header">
                    <h1>📊 API Navigator 统计报告</h1>
                    <p style="color: var(--vscode-descriptionForeground); margin: 5px 0;">
                        生成时间: ${new Date().toLocaleString('zh-CN')}
                    </p>
                </div>



            <div class="stats-grid">
                <!-- 总体概况 -->
                <div class="stat-card">
                    <h3>📈 总体概况</h3>
                    <div class="stat-item">
                        <span class="stat-label">总端点数量</span>
                        <span class="stat-value">${stats.totalEndpoints} 个</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">控制器数量</span>
                        <span class="stat-value">${stats.controllerCount} 个</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">平均端点密度</span>
                        <span class="stat-value">${avgEndpointsPerController} 个/控制器</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">参数化端点</span>
                        <span class="stat-value">${paramEndpoints} 个 (${Math.round(paramEndpoints / stats.totalEndpoints * 100)}%)</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">静态端点</span>
                        <span class="stat-value">${staticEndpoints} 个 (${Math.round(staticEndpoints / stats.totalEndpoints * 100)}%)</span>
                    </div>
                </div>

                <!-- HTTP方法分布 -->
                <div class="stat-card">
                    <h3>🔗 HTTP 方法分布</h3>
                    ${methodStats.map(({ method, count, percentage }) => `
                    <div class="stat-item">
                        <div class="method-bar">
                            <span class="method-tag ${method}">${method}</span>
                            <span class="stat-label">${method} 请求</span>
                        </div>
                        <span class="stat-value">${count} 个 (${percentage}%)</span>
                    </div>
                    `).join('')}
                </div>

                <!-- 控制器排行榜 -->
                ${controllerRanking.length > 0 ? `
                <div class="stat-card">
                    <h3>🏛️ 控制器排行榜</h3>
                    ${controllerRanking.map((ctrl, index) => {
                        const medals = ['🥇', '🥈', '🥉', '🏅', '⭐'];
                        const medal = medals[index] || '📌';
                        return `
                        <div class="controller-item">
                            <div class="controller-name">
                                <span>${medal}</span>
                                <span>${ctrl.name}</span>
                            </div>
                            <span class="controller-count">${ctrl.count} 个端点</span>
                        </div>
                        `;
                    }).join('')}
                </div>
                ` : ''}

                <!-- 热门路径前缀 -->
                ${topPatterns.length > 0 ? `
                <div class="stat-card">
                    <h3>🛤️ 热门路径前缀</h3>
                    ${topPatterns.map(([pattern, count], index) => {
                        const icons = ['🔥', '⭐', '💫'];
                        const icon = icons[index] || '📌';
                        return `
                        <div class="path-item">
                            <div class="path-pattern">
                                <span>${icon}</span>
                                <span>/${pattern}</span>
                            </div>
                            <span class="stat-value">${count} 个端点</span>
                        </div>
                        `;
                    }).join('')}
                </div>
                ` : ''}
            </div>

            <!-- 数据可视化图表区域 -->
            <div class="charts-section">
                <h2 style="text-align: center; margin-bottom: 30px; color: var(--vscode-foreground);">
                    📊 数据可视化分析
                </h2>
                
                <div class="charts-grid">
                    <!-- HTTP方法分布饼图 -->
                    <div class="chart-container">
                        <h3>🔗 HTTP方法分布</h3>
                        <div class="chart-wrapper">
                            <canvas id="methodChart" width="400" height="300"></canvas>
                        </div>
                    </div>

                    <!-- 控制器端点分布柱状图 -->
                    <div class="chart-container">
                        <h3>🏛️ 控制器端点分布</h3>
                        <div class="chart-wrapper">
                            <canvas id="controllerChart" width="400" height="300"></canvas>
                        </div>
                    </div>

                    <!-- 端点复杂度分布雷达图 -->
                    <div class="chart-container">
                        <h3>🏗️ 端点复杂度分析</h3>
                        <div class="chart-wrapper">
                            <canvas id="complexityChart" width="400" height="300"></canvas>
                        </div>
                    </div>

                    
 
                </div>
            </div>

            <!-- 概念说明模块 - 置于图表下方，默认收起 -->
            <div class="concept-section">
                <div class="concept-header" id="concepts-header">
                    <h2 class="concept-title">📚 关键概念说明</h2>
                    <span class="toggle-icon" id="concepts-icon">▶</span>
                </div>
                
                <div class="concept-content collapsed" id="concepts-content">
                    <!-- 参数化端点 vs 静态端点 -->
                    <div class="concept-item">
                        <div class="concept-name">🔗 参数化端点 vs 静态端点</div>
                        <div class="concept-description">
                            <strong>参数化端点</strong>：包含路径参数的API端点，路径中包含 <code>{参数名}</code> 形式的动态部分。
                        </div>
                        <div class="concept-example">
                            示例：/api/users/{id} 、/api/orders/{orderId}/items/{itemId}
                        </div>
                        <div class="concept-description" style="margin-top: 10px;">
                            <strong>静态端点</strong>：固定路径的API端点，路径中不包含任何动态参数。
                        </div>
                        <div class="concept-example">
                            示例：/api/users 、/api/health 、/api/version
                        </div>
                        
                        <div class="stats-comparison">
                            <div class="stat-box">
                                <div class="stat-number">${paramEndpoints}</div>
                                <div class="stat-label">参数化端点</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-number">${staticEndpoints}</div>
                                <div class="stat-label">静态端点</div>
                            </div>
                        </div>
                    </div>

                    <!-- 控制器密度 -->
                    <div class="concept-item">
                        <div class="concept-name">📊 控制器密度</div>
                        <div class="concept-description">
                            平均每个控制器包含的API端点数量，反映代码组织的精细程度和职责分离情况。
                        </div>
                        <div class="concept-example">
                            计算公式：总端点数 ÷ 控制器数量 = 控制器密度<br>
                            当前项目：${stats.totalEndpoints} ÷ ${stats.controllerCount} = ${avgEndpointsPerController} 个端点/控制器
                        </div>
                        
                        <div class="tip-section">
                            <div class="tip-title">💡 最佳实践建议</div>
                            <div>
                                • 理想密度：5-15个端点/控制器<br>
                                • 密度过高：考虑拆分控制器，遵循单一职责原则<br>
                                • 密度过低：可能存在过度设计，考虑合并相关功能
                            </div>
                        </div>
                    </div>

                    <!-- HTTP方法分布 -->
                    <div class="concept-item">
                        <div class="concept-name">🔗 HTTP方法分布</div>
                        <div class="concept-description">
                            不同HTTP方法的使用比例，反映API的操作类型分布和RESTful设计规范程度。
                        </div>
                        <div class="concept-example">
                            GET：读取数据（查询操作）<br>
                            POST：创建新资源<br>
                            PUT：完整更新资源<br>
                            PATCH：部分更新资源<br>
                            DELETE：删除资源
                        </div>

                        <div class="tip-section">
                            <div class="tip-title">💡 RESTful设计提示</div>
                            <div>
                                • GET通常占比最高（40-60%）<br>
                                • POST用于创建操作（20-30%）<br>
                                • PUT/PATCH用于更新（10-20%）<br>
                                • DELETE用于删除（5-15%）
                            </div>
                        </div>
                    </div>

                    <!-- 路径复杂度 -->
                    <div class="concept-item">
                        <div class="concept-name">🏗️ 路径复杂度</div>
                        <div class="concept-description">
                            基于路径层级深度和参数数量计算的端点复杂度指标，帮助识别可能需要优化的API设计。
                        </div>
                        <div class="concept-example">
                            简单（1-2层）：/api/users<br>
                            中等（3-4层）：/api/v1/users/{id}<br>
                            复杂（5+层）：/api/v1/companies/{companyId}/departments/{deptId}/employees/{id}
                        </div>

                        <div class="tip-section">
                            <div class="tip-title">💡 复杂度优化建议</div>
                            <div>
                                • 避免过深的嵌套路径（>4层）<br>
                                • 考虑使用查询参数代替路径参数<br>
                                • 为复杂资源关系提供快捷访问路径
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tips">
                <h4>📋 快速操作提示</h4>
                <ul>
                    <li>使用 <strong>CMD+\\</strong> (macOS) 或 <strong>Ctrl+\\</strong> (Windows/Linux) 快速搜索端点</li>
                    <li>点击侧边栏中的端点可以直接跳转到对应的代码位置</li>
                    <li>搜索框支持路径、控制器名、方法名的模糊匹配</li>
                    <li>使用刷新按钮可以重新扫描项目中的API端点</li>
                </ul>
            </div>

            <button class="refresh-btn" id="refreshButton" onclick="refreshStats()">
                🔄 刷新统计
            </button>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                
                // 概念说明展开/折叠功能 (全局函数)
                function toggleSection(sectionId) {
                    const content = document.getElementById(sectionId + '-content');
                    const icon = document.getElementById(sectionId + '-icon');
                    
                    if (content && icon) {
                        if (content.classList.contains('collapsed')) {
                            // 展开：显示向下箭头
                            content.classList.remove('collapsed');
                            content.style.maxHeight = content.scrollHeight + 'px';
                            icon.textContent = '▼';
                            icon.style.transform = 'none';
                        } else {
                            // 折叠：显示向右箭头
                            content.classList.add('collapsed');
                            content.style.maxHeight = '0px';
                            icon.textContent = '▶';
                            icon.style.transform = 'none';
                        }
                    }
                }
                
                function refreshStats() {
                    console.log('刷新按钮被点击');
                    try {
                        vscode.postMessage({ command: 'refresh' });
                        // 临时禁用按钮，防止重复点击
                        const btn = document.getElementById('refreshButton');
                        if (btn) {
                            btn.disabled = true;
                            btn.textContent = '🔄 刷新中...';
                            setTimeout(() => {
                                btn.disabled = false;
                                btn.innerHTML = '🔄 刷新统计';
                            }, 1000);
                        }
                    } catch (error) {
                        console.error('发送刷新消息失败:', error);
                    }
                }

                // 确保页面加载完成后绑定事件
                document.addEventListener('DOMContentLoaded', function() {
                    console.log('统计WebView页面加载完成');
                    
                    // 双重保险：手动绑定点击事件
                    const refreshButton = document.getElementById('refreshButton');
                    if (refreshButton) {
                        refreshButton.addEventListener('click', function(e) {
                            e.preventDefault();
                            refreshStats();
                        });
                        console.log('刷新按钮事件绑定成功');
                    }
                    
                    // 绑定概念说明展开/收起事件
                    const conceptsHeader = document.getElementById('concepts-header');
                    if (conceptsHeader) {
                        conceptsHeader.addEventListener('click', function() {
                            toggleSection('concepts');
                        });
                        conceptsHeader.style.cursor = 'pointer';
                        console.log('概念说明折叠事件绑定成功');
                    }
                    
                    // 初始化概念说明模块 - 默认收起
                    const conceptsContent = document.getElementById('concepts-content');
                    if (conceptsContent) {
                        conceptsContent.classList.add('collapsed');
                        conceptsContent.style.maxHeight = '0px';
                        console.log('概念说明模块初始化完成 - 默认收起状态');
                    }

                    // 初始化图表
                    initializeCharts();
                });

                // 图表初始化函数 - 使用本地Chart.js
                function initializeCharts() {
                    console.log('📊 开始初始化图表系统');
                    console.log('当前脚本标签数量:', document.scripts.length);
                    
                    // 检查Chart.js是否加载完成
                    function tryInitCharts(attempts = 0) {
                        console.log(\`📊 检查Chart.js加载状态 (尝试 \${attempts + 1}): typeof Chart = \${typeof Chart}\`);
                        
                        // 详细的调试信息
                        const debugInfo = {
                            chartLoaded: window.chartLoaded,
                            chartLoadError: window.chartLoadError,
                            scriptsCount: document.scripts.length,
                            windowChart: typeof window.Chart,
                            globalChart: typeof Chart,
                            chartKeys: Object.keys(window).filter(k => k.toLowerCase().includes('chart'))
                        };
                        console.log('🔍 详细状态:', debugInfo);
                        
                        // 检查是否有脚本加载错误
                        if (window.chartLoadError) {
                            console.error('❌ Chart.js 脚本文件加载失败（网络或路径错误）');
                            showChartError('脚本文件加载失败', '请检查Chart.js文件是否存在且路径正确');
                            return;
                        }
                        
                        // 尝试多种方式获取Chart对象
                        let ChartConstructor = null;
                        if (typeof Chart !== 'undefined') {
                            ChartConstructor = Chart;
                            console.log('✅ 找到全局Chart对象');
                        } else if (typeof window.Chart !== 'undefined') {
                            ChartConstructor = window.Chart;
                            console.log('✅ 找到window.Chart对象');
                        }
                        
                        if (!ChartConstructor) {
                            if (attempts < 20) { // 减少重试次数，加快失败反馈
                                console.log(\`⏳ Chart.js 尚未加载完成，等待中... (尝试 \${attempts + 1}/20)\`);
                                setTimeout(() => tryInitCharts(attempts + 1), 200);
                                return;
                            } else {
                                console.error('❌ Chart.js 加载失败 - 最终诊断:');
                                console.error('文件类型:', window.chartLoaded ? 'UMD脚本已加载' : '脚本加载状态未知');
                                console.error('全局对象:', debugInfo.chartKeys);
                                
                                showChartError(
                                    'Chart.js 初始化失败', 
                                    window.chartLoaded ? 
                                        'UMD脚本已加载但未创建全局Chart对象' : 
                                        '脚本加载失败或超时'
                                );
                                return;
                            }
                        }
                        
                        // 将Chart对象设置为全局，确保后续函数能使用
                        window.Chart = ChartConstructor;

                        try {
                            console.log('📊 开始初始化图表，Chart.js版本:', Chart.version);
                            
                            // VSCode主题颜色适配
                            const isDarkTheme = document.body.classList.contains('vscode-dark');
                            const textColor = isDarkTheme ? '#cccccc' : '#333333';
                            const gridColor = isDarkTheme ? '#404040' : '#e0e0e0';

                            // 图表通用配置
                            Chart.defaults.color = textColor;
                            Chart.defaults.borderColor = gridColor;

                            // 1. HTTP方法分布饼图
                            initMethodChart();

                            // 2. 控制器端点分布柱状图  
                            initControllerChart();

                            // 3. 端点复杂度雷达图
                            initComplexityChart();

                            console.log('📊 所有图表初始化完成');
                        } catch (error) {
                            console.error('图表初始化过程中发生错误:', error);
                        }
                    }

                    tryInitCharts();
                }
                
                // 显示图表错误的辅助函数
                function showChartError(title, message) {
                    document.querySelectorAll('.chart-container').forEach(container => {
                        const wrapper = container.querySelector('.chart-wrapper');
                        if (wrapper) {
                            wrapper.innerHTML = \`
                                <div style="color: var(--vscode-errorForeground, #f44336); text-align: center; padding: 20px; border: 1px dashed var(--vscode-errorBorder, #f44336); border-radius: 4px;">
                                    <div style="font-size: 24px; margin-bottom: 10px;">📊</div>
                                    <div style="font-weight: bold; margin-bottom: 8px;">\${title}</div>
                                    <div style="font-size: 12px; opacity: 0.8; margin-bottom: 8px;">
                                        \${message}
                                    </div>
                                    <div style="font-size: 11px; opacity: 0.6;">
                                        💡 请查看浏览器控制台获取更多调试信息
                                    </div>
                                </div>
                            \`;
                        }
                    });
                }
                


                // HTTP方法分布饼图
                function initMethodChart() {
                    const ctx = document.getElementById('methodChart');
                    if (!ctx) {
                        console.error('未找到methodChart元素');
                        return;
                    }

                    try {
                        // 从现有统计数据中提取HTTP方法分布
                        const methodData = {
                            ${Object.entries(stats.methodCounts || {}).map(([method, count]) => 
                                `'${method}': ${count}`
                            ).join(',\n                            ')}
                        };

                        const methodColors = {
                            'GET': '#4CAF50',
                            'POST': '#2196F3', 
                            'PUT': '#FF9800',
                            'DELETE': '#F44336',
                            'PATCH': '#9C27B0',
                            'HEAD': '#607D8B',
                            'OPTIONS': '#795548'
                        };

                        console.log('HTTP方法数据:', methodData);

                        const chart = new Chart(ctx, {
                            type: 'pie',
                            data: {
                                labels: Object.keys(methodData),
                                datasets: [{
                                    data: Object.values(methodData),
                                    backgroundColor: Object.keys(methodData).map(method => methodColors[method] || '#999999'),
                                    borderWidth: 2,
                                    borderColor: '#ffffff'
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        position: 'bottom',
                                        labels: {
                                            padding: 20,
                                            usePointStyle: true,
                                            font: {
                                                size: 12
                                            }
                                        }
                                    },
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                                return \`\${context.label}: \${context.parsed} (\${percentage}%)\`;
                                            }
                                        }
                                    }
                                }
                            }
                        });
                        console.log('HTTP方法饼图创建成功');
                    } catch (error) {
                        console.error('HTTP方法饼图创建失败:', error);
                    }
                }

                                // 控制器端点分布柱状图
                function initControllerChart() {
                    const ctx = document.getElementById('controllerChart');
                    if (!ctx) {
                        console.error('未找到controllerChart元素');
                        return;
                    }

                    try {
                        // 使用实际控制器数据而不是模拟数据
                        const controllerData = [
                            ${controllerRanking.map(ctrl => 
                                `{ name: '${ctrl.name}', fullName: '${ctrl.fullName}', count: ${ctrl.count} }`
                            ).join(',\n                            ')}
                        ];

                        console.log('控制器数据:', controllerData);

                        new Chart(ctx, {
                            type: 'bar',
                            data: {
                                labels: controllerData.map(item => item.fullName),
                                datasets: [{
                                    label: '端点数量',
                                    data: controllerData.map(item => item.count),
                                    backgroundColor: [
                                        'rgba(33, 150, 243, 0.8)',
                                        'rgba(76, 175, 80, 0.8)', 
                                        'rgba(255, 152, 0, 0.8)',
                                        'rgba(244, 67, 54, 0.8)',
                                        'rgba(156, 39, 176, 0.8)'
                                    ],
                                    borderColor: [
                                        'rgba(33, 150, 243, 1)',
                                        'rgba(76, 175, 80, 1)',
                                        'rgba(255, 152, 0, 1)',
                                        'rgba(244, 67, 54, 1)',
                                        'rgba(156, 39, 176, 1)'
                                    ],
                                    borderWidth: 1
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        ticks: {
                                            stepSize: 1
                                        }
                                    }
                                },
                                plugins: {
                                    legend: {
                                        display: false
                                    }
                                }
                            }
                        });
                        console.log('控制器柱状图创建成功');
                    } catch (error) {
                        console.error('控制器柱状图创建失败:', error);
                    }
                }

                                // 端点复杂度雷达图
                function initComplexityChart() {
                    const ctx = document.getElementById('complexityChart');
                    if (!ctx) {
                        console.error('未找到complexityChart元素');
                        return;
                    }

                    try {
                        // 获取真实端点数据计算复杂度
                        const endpointsData = [
                            ${endpoints.map(ep => `{
                                path: '${ep.path}',
                                parameters: ${JSON.stringify(ep.parameters || [])},
                                annotations: ${JSON.stringify(ep.annotations || [])}
                            }`).join(',\n                            ')}
                        ];
                        
                        if (endpointsData.length === 0) {
                            // 显示空状态提示
                            ctx.parentElement.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--vscode-foreground);">暂无端点数据</div>';
                            return;
                        }

                        // 计算真实复杂度指标
                        const complexityMetrics = calculateRealComplexityMetrics(endpointsData);
                        
                        new Chart(ctx, {
                            type: 'radar',
                            data: {
                                labels: ['路径层级', '参数数量', '注解复杂度'],
                                datasets: [{
                                    label: '平均复杂度',
                                    data: [
                                        complexityMetrics.pathComplexity,
                                        complexityMetrics.parameterComplexity, 
                                        complexityMetrics.annotationComplexity
                                    ],
                                    backgroundColor: 'rgba(76, 175, 80, 0.2)',
                                    borderColor: 'rgba(76, 175, 80, 1)',
                                    borderWidth: 2,
                                    pointBackgroundColor: 'rgba(76, 175, 80, 1)',
                                    pointBorderColor: '#fff',
                                    pointHoverBackgroundColor: '#fff',
                                    pointHoverBorderColor: 'rgba(76, 175, 80, 1)',
                                    pointRadius: 5,
                                    pointHoverRadius: 7
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    r: {
                                        beginAtZero: true,
                                        max: 5,
                                        ticks: {
                                            stepSize: 1
                                        }
                                    }
                                },
                                plugins: {
                                    legend: {
                                        display: false
                                    },
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                const labels = ['路径层级', '参数数量', '注解复杂度'];
                                                const descriptions = [
                                                    '平均路径分段数',
                                                    '平均参数个数', 
                                                    '平均注解数量'
                                                ];
                                                return labels[context.dataIndex] + ': ' + context.parsed.r.toFixed(1) + ' (' + descriptions[context.dataIndex] + ')';
                                            }
                                        }
                                    }
                                }
                            }
                        });
                        console.log('复杂度雷达图创建成功 (使用真实数据)');
                    } catch (error) {
                        console.error('复杂度雷达图创建失败:', error);
                    }
                }

                // 计算真实复杂度指标的辅助函数
                function calculateRealComplexityMetrics(endpoints) {
                    let totalPathComplexity = 0;
                    let totalParameterComplexity = 0;
                    let totalAnnotationComplexity = 0;
                    
                    endpoints.forEach(endpoint => {
                        // 1. 路径复杂度 = 路径分段数 (最大5分制)
                        const pathSegments = endpoint.path.split('/').filter(segment => segment && segment.trim() !== '');
                        const pathComplexity = Math.min(pathSegments.length, 5);
                        totalPathComplexity += pathComplexity;
                        
                        // 2. 参数复杂度 = 参数数量 (最大5分制)
                        const parameterCount = endpoint.parameters ? endpoint.parameters.length : 0;
                        const parameterComplexity = Math.min(parameterCount, 5);
                        totalParameterComplexity += parameterComplexity;
                        
                        // 3. 注解复杂度 = 注解数量 (最大5分制)
                        const annotationCount = endpoint.annotations ? endpoint.annotations.length : 0;
                        const annotationComplexity = Math.min(annotationCount, 5);
                        totalAnnotationComplexity += annotationComplexity;
                    });
                    
                    const endpointCount = endpoints.length;
                    
                    return {
                        pathComplexity: (totalPathComplexity / endpointCount).toFixed(1),
                        parameterComplexity: (totalParameterComplexity / endpointCount).toFixed(1),
                        annotationComplexity: (totalAnnotationComplexity / endpointCount).toFixed(1)
                    };
                }



            </script>
            </div> <!-- main-container -->
        </body>
        </html>`;
    }

    private getEmptyStateHtml(): string {
        const nonce = this.getNonce();
        
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>API Navigator 统计信息</title>
            <style>
                body {
                    padding: 40px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    text-align: center;
                }
                .empty-container {
                    max-width: 400px;
                    margin: 0 auto;
                }
                .empty-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                .empty-title {
                    font-size: 20px;
                    margin-bottom: 10px;
                    color: var(--vscode-foreground);
                }
                .empty-desc {
                    color: var(--vscode-descriptionForeground);
                    line-height: 1.6;
                }
            </style>
        </head>
        <body>
            <div class="empty-container">
                <div class="empty-icon">🔍</div>
                <div class="empty-title">未找到任何 API 端点</div>
                <div class="empty-desc">
                    请确保项目包含带有 @RestController 或 @Controller 注解的 Java 文件。
                    <br><br>
                    API Navigator 会自动扫描项目中的 Spring Boot 控制器。
                </div>
            </div>
        </body>
        </html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
} 