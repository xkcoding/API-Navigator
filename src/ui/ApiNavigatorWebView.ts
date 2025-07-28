import * as vscode from 'vscode';
import { ApiIndexer } from '../core/ApiIndexer';
import { ApiEndpoint, SearchFilters, SearchOptions } from '../core/types';

/**
 * WebView Provider for API Navigator with embedded search
 */
export class ApiNavigatorWebView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'apiNavigatorWebView';
    private _view?: vscode.WebviewView;
    private _isDataLoaded = false;
    private _isRefreshing = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly apiIndexer: ApiIndexer
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 监听来自 WebView 的消息
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'search':
                    this._handleSearch(data.query);
                    break;
                case 'advancedSearch':
                    this._handleAdvancedSearch(data.filters, data.options);
                    break;
                case 'openEndpoint':
                    this._openEndpoint(data.endpoint);
                    break;
                case 'refresh':
                    this._handleRefresh();
                    break;
                case 'showStatistics':
                    this._handleShowStatistics();
                    break;
                case 'webviewReady':
                    this._handleWebviewReady();
                    break;
                case 'requestData':
                    this._handleRequestData();
                    break;
            }
        });

        // 监听视图可见性变化
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                console.log(`📍 视图可见性变化: visible=true, isDataLoaded=${this._isDataLoaded}`);
                
                // 如果数据已经加载过，直接发送当前数据，避免loading状态
                if (this._isDataLoaded) {
                    const allEndpoints = this.apiIndexer.getAllEndpoints();
                    this._sendDataToWebview(allEndpoints, '');
                    console.log('📍 视图重新可见，直接发送已有数据');
                } else if (!this._isRefreshing) {
                    // 只有在数据确实未加载且没有刷新进行中时才加载
                    console.log('📍 视图重新可见，首次加载数据');
                    this._loadInitialData();
                }
            }
        });

        // 初始加载数据
        this._loadInitialData();
    }

    private _handleSearch(query: string) {
        if (!query.trim()) {
            // 显示所有端点
            const allEndpoints = this.apiIndexer.getAllEndpoints();
            this._sendDataToWebview(allEndpoints, '');
        } else {
            // 执行搜索
            const searchResults = this.apiIndexer.searchEndpoints(query);
            this._sendDataToWebview(searchResults, query);
        }
    }

    private _handleAdvancedSearch(filters: SearchFilters, options: SearchOptions) {
        try {
            // 执行高级搜索
            const searchResults = this.apiIndexer.searchEndpointsAdvanced(filters, options);
            
            // 构建搜索描述
            const searchDescription = this._buildSearchDescription(filters);
            
            // 发送结果到 WebView
            this._sendDataToWebview(searchResults, searchDescription);
            
            console.log(`高级搜索完成: 找到 ${searchResults.length} 个结果`);
        } catch (error) {
            console.error('高级搜索失败:', error);
            vscode.window.showErrorMessage(`搜索失败: ${error}`);
        }
    }

    private _buildSearchDescription(filters: SearchFilters): string {
        const descriptions: string[] = [];
        
        if (filters.query) {
            descriptions.push(`文本: "${filters.query}"`);
        }
        
        if (filters.methods && filters.methods.length > 0) {
            descriptions.push(`方法: ${filters.methods.join(', ')}`);
        }
        
        if (filters.pathPattern) {
            descriptions.push(`路径: "${filters.pathPattern}"`);
        }
        
        if (filters.hasParameters !== undefined) {
            descriptions.push(`参数: ${filters.hasParameters ? '包含' : '不包含'}`);
        }
        
        if (filters.controllerPattern) {
            descriptions.push(`控制器: "${filters.controllerPattern}"`);
        }
        
        return descriptions.length > 0 ? `高级搜索 (${descriptions.join(', ')})` : '高级搜索';
    }

    private _openEndpoint(endpoint: ApiEndpoint) {
        if (endpoint && endpoint.location) {
            // 使用0基索引，确保与CMD+\行为一致
            const position = new vscode.Position(
                Math.max(0, endpoint.location.startLine - 1), 
                endpoint.location.startColumn
            );
            const selection = new vscode.Range(position, position);
            
            vscode.workspace.openTextDocument(vscode.Uri.file(endpoint.location.filePath))
                .then(document => {
                    vscode.window.showTextDocument(document, {
                        selection: selection,
                        preserveFocus: false,
                        viewColumn: vscode.ViewColumn.Active
                    }).then(editor => {
                        // 确保光标位置和视图居中
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
                    });
                });
        }
    }

    private _handleRefresh() {
        // 防止重复刷新
        if (this._isRefreshing) {
            return;
        }

        this._isRefreshing = true;
        this._isDataLoaded = false;
        
        // 显示loading状态
        this._sendLoadingState(true, '刷新索引中...');
        
        // 调用缓存刷新命令，这会提供完整的用户反馈
        Promise.resolve(vscode.commands.executeCommand('apiNavigator.refreshCache')).then(() => {
            // 添加短暂延迟确保缓存刷新完成后再加载数据
            setTimeout(() => {
                this._loadInitialData();
            }, 500);
        }, (error: any) => {
            console.error('刷新失败:', error);
            // 即使失败也要尝试加载数据
            this._loadInitialData();
        }).finally(() => {
            this._isRefreshing = false;
        });
    }

    private _handleShowStatistics() {
        // 调用增强版的统计功能
        vscode.commands.executeCommand('apiNavigator.showStatistics');
    }

    private _handleWebviewReady() {
        // WebView准备就绪时的处理
        console.log(`📋 WebView准备就绪: isDataLoaded=${this._isDataLoaded}, isRefreshing=${this._isRefreshing}`);
        
        // 总是发送当前数据状态，避免空白页面
        const allEndpoints = this.apiIndexer.getAllEndpoints();
        this._sendDataToWebview(allEndpoints, '');
        
        // 标记数据已加载
        this._isDataLoaded = true;
    }

    private _handleRequestData() {
        // 处理主动请求数据
        if (!this._isRefreshing) {
            this._loadInitialData();
        }
    }

    private _loadInitialData() {
        const allEndpoints = this.apiIndexer.getAllEndpoints();
        this._sendDataToWebview(allEndpoints, '');
        this._isDataLoaded = true;
    }

    private _sendDataToWebview(endpoints: ApiEndpoint[], searchQuery: string) {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateData',
                endpoints: endpoints,
                searchQuery: searchQuery,
                totalCount: endpoints.length
            });
        }
    }

    private _sendLoadingState(show: boolean, text?: string) {
        if (this._view) {
            this._view.webview.postMessage({
                type: show ? 'showLoading' : 'hideLoading',
                text: text
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // 获取样式和脚本的URI
        const stylesResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const stylesMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const stylesCustomUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'api-navigator.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'api-navigator.js'));

        // 使用nonce以确保安全性
        const nonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${stylesResetUri}" rel="stylesheet">
            <link href="${stylesMainUri}" rel="stylesheet">
            <link href="${stylesCustomUri}" rel="stylesheet">
            <title>API Navigator</title>
        </head>
        <body>
            <div class="api-navigator-container">
                <!-- 搜索区域 -->
                <div class="search-container">
                    <div class="search-header">
                        <span class="search-icon">🔍</span>
                        <input 
                            type="text" 
                            id="searchInput" 
                            placeholder="搜索 API 端点..."
                            class="search-input"
                        >
                        <button id="clearBtn" class="clear-btn" title="清除搜索">✕</button>
                    </div>
                    <div class="search-info">
                        <span id="searchInfo">准备搜索...</span>
                        <div class="toolbar-buttons">
                            <button id="advancedSearchBtn" class="toolbar-btn" title="高级搜索">
                                <span class="btn-icon">⚙️</span>
                            </button>
                            <button id="toggleCollapseBtn" class="toolbar-btn" title="展开/折叠所有分组">
                                <span class="btn-icon">🔀</span>
                            </button>
                            <button id="statisticsBtn" class="toolbar-btn" title="显示统计信息">
                                <span class="btn-icon">📊</span>
                            </button>
                            <button id="refreshBtn" class="toolbar-btn" title="刷新数据">
                                <span class="btn-icon">🔄</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 结果区域 -->
                <div class="results-container">
                    <div id="loadingIndicator" class="loading-indicator" style="display: none;">
                        <span class="loading-spinner">⏳</span>
                        <span id="loadingText">处理中...</span>
                    </div>
                    
                    <div id="emptyState" class="empty-state">
                        <div class="empty-icon">🚀</div>
                        <div class="empty-title">欢迎使用 API Navigator</div>
                        <div class="empty-desc">开始搜索或浏览项目中的 API 端点</div>
                    </div>

                    <div id="resultsSection" class="results-section" style="display: none;">
                        <div id="resultsList" class="results-list">
                            <!-- 动态内容将在这里填充 -->
                        </div>
                    </div>
                </div>

                <!-- 高级搜索区域 (内联折叠式) -->
                <div id="advancedSearchContainer" class="advanced-search-container" style="display: none;">
                    <div class="advanced-search-header">
                        <h4>🔍 高级搜索</h4>
                        <button id="closeAdvancedSearch" class="close-btn" title="关闭高级搜索">✕</button>
                    </div>
                    
                    <div class="advanced-search-content">
                        <div class="search-row">
                            <!-- HTTP方法快速过滤 -->
                            <div class="filter-group">
                                <label>方法</label>
                                <div class="method-filters">
                                    <button class="method-filter all-methods active" data-method="ALL">全部</button>
                                    <button class="method-filter" data-method="GET">GET</button>
                                    <button class="method-filter" data-method="POST">POST</button>
                                    <button class="method-filter" data-method="PUT">PUT</button>
                                    <button class="method-filter" data-method="DELETE">DEL</button>
                                    <button class="method-filter" data-method="PATCH">PATCH</button>
                                </div>
                            </div>
                            
                            <!-- 路径类型快速过滤 -->
                            <div class="filter-group">
                                <label>类型</label>
                                <div class="type-filters">
                                    <button class="type-filter active" data-type="all">全部</button>
                                    <button class="type-filter" data-type="param">参数化</button>
                                    <button class="type-filter" data-type="static">静态</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="search-row">
                            <!-- 路径模式搜索 -->
                            <div class="input-group">
                                <label for="pathPattern">路径模式</label>
                                <input type="text" id="pathPattern" placeholder="/api/*, /users/{id}">
                            </div>
                            
                            <!-- 控制器搜索 -->
                            <div class="input-group">
                                <label for="controllerPattern">控制器</label>
                                <input type="text" id="controllerPattern" placeholder="UserController, *Service">
                            </div>
                        </div>
                        
                        <div class="search-actions">
                            <div class="search-options">
                                <label class="option-label">
                                    <input type="checkbox" id="caseSensitive"> 区分大小写
                                </label>
                                <label class="option-label">
                                    <input type="checkbox" id="useRegex"> 正则表达式
                                </label>
                            </div>
                            <div class="action-buttons">
                                <button id="resetAdvancedSearch" class="btn-reset">重置</button>
                                <button id="executeAdvancedSearch" class="btn-search">搜索</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    public refresh() {
        this._handleRefresh();
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
} 