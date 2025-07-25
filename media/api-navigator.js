// API Navigator WebView JavaScript

(function() {
    const vscode = acquireVsCodeApi();
    
    // DOM 元素
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const statisticsBtn = document.getElementById('statisticsBtn');
    const toggleCollapseBtn = document.getElementById('toggleCollapseBtn');
    const searchInfo = document.getElementById('searchInfo');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const emptyState = document.getElementById('emptyState');
    const resultsSection = document.getElementById('resultsSection');
    const resultsList = document.getElementById('resultsList');
    
    // 状态管理
    let currentEndpoints = [];
    let currentSearchQuery = '';
    let searchTimeout = null;
    let allCollapsed = false;
    
    // 初始化事件监听器
    function initializeEventListeners() {
        // 搜索输入事件
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            
            // 防抖处理，避免频繁搜索
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            searchTimeout = setTimeout(() => {
                handleSearch(query);
            }, 300);
            
            // 立即更新清除按钮状态
            updateClearButtonState(query);
        });
        
        // 清除按钮事件
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            handleSearch('');
            updateClearButtonState('');
            searchInput.focus();
        });
        
        // 刷新按钮事件
        refreshBtn.addEventListener('click', () => {
            showLoading(true, '刷新索引中...');
            setButtonLoading(refreshBtn, true);
            vscode.postMessage({
                type: 'refresh'
            });
        });
        
        // 统计按钮事件
        statisticsBtn.addEventListener('click', () => {
            vscode.postMessage({
                type: 'showStatistics'
            });
        });
        
        // 折叠/展开按钮事件
        toggleCollapseBtn.addEventListener('click', () => {
            toggleAllGroups();
        });
        
        // 搜索框快捷键
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                handleSearch('');
                updateClearButtonState('');
            }
        });
    }
    
    // 处理搜索
    function handleSearch(query) {
        currentSearchQuery = query;
        showLoading(true, '搜索中...');
        
        vscode.postMessage({
            type: 'search',
            query: query
        });
    }
    
    // 更新清除按钮状态
    function updateClearButtonState(query) {
        clearBtn.style.display = query.trim() ? 'block' : 'none';
    }
    
    // 设置按钮加载状态
    function setButtonLoading(button, loading) {
        if (loading) {
            button.classList.add('loading');
        } else {
            button.classList.remove('loading');
        }
    }
    
    // 更新折叠/展开按钮状态
    function updateToggleButtonState() {
        const icon = toggleCollapseBtn.querySelector('.btn-icon');
        if (allCollapsed) {
            icon.textContent = '🔀'; // 统一使用切换图标
            toggleCollapseBtn.title = '展开所有分组';
        } else {
            icon.textContent = '🔀'; // 统一使用切换图标
            toggleCollapseBtn.title = '折叠所有分组';
        }
    }
    
    // 切换所有分组的折叠/展开状态
    function toggleAllGroups() {
        const groups = document.querySelectorAll('.controller-group');
        allCollapsed = !allCollapsed;
        
        groups.forEach(group => {
            if (allCollapsed) {
                group.classList.add('collapsed');
            } else {
                group.classList.remove('collapsed');
            }
        });
        
        updateToggleButtonState();
    }
    
    // 显示/隐藏加载状态
    function showLoading(show, text = '处理中...') {
        const loadingText = document.getElementById('loadingText');
        if (show) {
            if (loadingText) {
                loadingText.textContent = text;
            }
            loadingIndicator.style.display = 'flex';
            emptyState.style.display = 'none';
            resultsSection.style.display = 'none';
        } else {
            loadingIndicator.style.display = 'none';
        }
    }
    
    // 更新搜索信息
    function updateSearchInfo(query, totalCount) {
        if (!query.trim()) {
            searchInfo.textContent = totalCount > 0 
                ? `显示 ${totalCount} 个 API 端点` 
                : '准备搜索...';
        } else {
            searchInfo.textContent = totalCount > 0 
                ? `找到 ${totalCount} 个匹配 "${query}" 的结果`
                : `未找到匹配 "${query}" 的结果`;
        }
    }
    
    // 渲染端点列表
    function renderEndpoints(endpoints, searchQuery) {
        if (endpoints.length === 0) {
            showEmptyState(searchQuery);
            return;
        }
        
        // 按控制器分组
        const groupedEndpoints = groupEndpointsByController(endpoints);
        
        // 生成HTML
        const html = generateEndpointsHTML(groupedEndpoints, searchQuery);
        resultsList.innerHTML = html;
        
        // 绑定点击事件
        bindEndpointClickEvents();
        bindControllerToggleEvents(); // 绑定控制器组折叠事件
        
        // 显示结果区域
        showLoading(false);
        emptyState.style.display = 'none';
        resultsSection.style.display = 'block';
    }
    
    // 显示空状态
    function showEmptyState(searchQuery) {
        const emptyIcon = document.querySelector('.empty-icon');
        const emptyTitle = document.querySelector('.empty-title');
        const emptyDesc = document.querySelector('.empty-desc');
        
        if (searchQuery) {
            emptyIcon.textContent = '🔍';
            emptyTitle.textContent = '未找到匹配的结果';
            emptyDesc.textContent = `没有找到匹配 "${searchQuery}" 的 API 端点，请尝试其他关键词`;
        } else {
            emptyIcon.textContent = '🚀';
            emptyTitle.textContent = '欢迎使用 API Navigator';
            emptyDesc.textContent = '开始搜索或浏览项目中的 API 端点';
        }
        
        // 确保关闭loading状态
        showLoading(false);
        emptyState.style.display = 'flex';
        resultsSection.style.display = 'none';
    }
    
    // 按控制器分组端点
    function groupEndpointsByController(endpoints) {
        const groups = {};
        
        endpoints.forEach(endpoint => {
            const controllerName = endpoint.controllerClass.split('.').pop();
            if (!groups[controllerName]) {
                groups[controllerName] = [];
            }
            groups[controllerName].push(endpoint);
        });
        
        return groups;
    }
    
    // 生成端点HTML
    function generateEndpointsHTML(groupedEndpoints, searchQuery) {
        let html = '';
        
        // 按控制器名称排序
        const sortedControllerNames = Object.keys(groupedEndpoints).sort();
        
        sortedControllerNames.forEach(controllerName => {
            const endpoints = groupedEndpoints[controllerName];
            
            html += `
                <div class="controller-group">
                    <div class="controller-header" data-controller="${escapeHtml(controllerName)}">
                        <span class="controller-toggle">▼</span>
                        <span class="controller-title">${escapeHtml(controllerName)}</span>
                        <span class="controller-count">(${endpoints.length})</span>
                    </div>
                    <div class="controller-endpoints">
            `;
            
            endpoints.forEach(endpoint => {
                html += generateEndpointHTML(endpoint, searchQuery);
            });
            
            html += '</div></div>';
        });
        
        return html;
    }
    
    // 生成单个端点HTML
    function generateEndpointHTML(endpoint, searchQuery) {
        const methodName = `${endpoint.controllerClass.split('.').pop()}.${endpoint.methodName}`;
        const lineNumber = endpoint.location ? endpoint.location.startLine : 0;
        const methodWithLine = `${methodName}:${lineNumber}`;
        
        const path = highlightSearchTerm(endpoint.path, searchQuery);
        const method = highlightSearchTerm(methodWithLine, searchQuery);
        
        return `
            <div class="endpoint-item" data-endpoint='${JSON.stringify(endpoint)}'>
                <div class="endpoint-header">
                    <span class="http-method ${endpoint.method}">${endpoint.method}</span>
                    <span class="endpoint-path">${path}</span>
                </div>
                <div class="endpoint-details">
                    <div class="endpoint-method">${method}</div>
                </div>
            </div>
        `;
    }
    
    // 高亮搜索词
    function highlightSearchTerm(text, searchQuery) {
        if (!searchQuery.trim()) {
            return escapeHtml(text);
        }
        
        const escapedText = escapeHtml(text);
        const escapedQuery = escapeHtml(searchQuery);
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        
        return escapedText.replace(regex, '<span class="search-highlight">$1</span>');
    }
    
    // HTML转义
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 绑定端点点击事件
    function bindEndpointClickEvents() {
        const endpointItems = document.querySelectorAll('.endpoint-item');
        
        endpointItems.forEach(item => {
            item.addEventListener('click', () => {
                const endpointData = JSON.parse(item.dataset.endpoint);
                vscode.postMessage({
                    type: 'openEndpoint',
                    endpoint: endpointData
                });
            });
        });
    }
    
    // 绑定控制器组折叠事件
    function bindControllerToggleEvents() {
        const controllerHeaders = document.querySelectorAll('.controller-header');
        
        controllerHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const group = header.parentElement;
                group.classList.toggle('collapsed');
            });
        });
    }
    
    // 监听来自扩展的消息
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'updateData':
                currentEndpoints = message.endpoints;
                updateSearchInfo(message.searchQuery, message.totalCount);
                renderEndpoints(message.endpoints, message.searchQuery);
                // 确保重置所有loading状态
                showLoading(false);
                setButtonLoading(refreshBtn, false);
                break;
            case 'showLoading':
                showLoading(true, message.text || '处理中...');
                break;
            case 'hideLoading':
                showLoading(false);
                break;
        }
    });
    
    // 初始化
    function initialize() {
        initializeEventListeners();
        updateClearButtonState('');
        updateToggleButtonState();
        
        // 显示初始加载状态
        showLoading(true, '正在加载 API 端点...');
        
        // 通知扩展端WebView已准备就绪，并请求数据
        vscode.postMessage({
            type: 'webviewReady'
        });
        
        // 主动请求数据（备用机制）
        setTimeout(() => {
            if (currentEndpoints.length === 0) {
                vscode.postMessage({
                    type: 'requestData'
                });
            }
        }, 1000);
        
        // 聚焦搜索框
        setTimeout(() => {
            searchInput.focus();
        }, 100);
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})(); 