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
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel!.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${stylesUri}" rel="stylesheet">
            <title>API Navigator 统计信息</title>
            <style>
                body {
                    padding: 20px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    line-height: 1.6;
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
            </style>
        </head>
        <body>
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
                });
            </script>
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