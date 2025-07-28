// API Navigator WebView JavaScript - 重构版本

(function() {
    'use strict';
    
    console.log('🚀 API Navigator JavaScript 开始加载...');
    
    const vscode = acquireVsCodeApi();
    
    // 全局状态管理
    const state = {
        currentEndpoints: [],
        currentSearchQuery: '',
        searchTimeout: null,
        allCollapsed: false,
        isInitialized: false
    };
    
    // DOM元素缓存
    const elements = {};
    
    // 获取并缓存DOM元素
    function cacheElement(id, required = true) {
        const element = document.getElementById(id);
        if (element) {
            elements[id] = element;
            console.log(`✅ 元素 ${id} 找到并缓存`);
            return element;
        } else {
            console.error(`❌ 元素 ${id} 未找到${required ? ' (必需)' : ' (可选)'}`);
            if (required) {
                throw new Error(`必需的DOM元素 ${id} 未找到`);
            }
            return null;
        }
    }
    
    // 初始化DOM元素缓存
    function initializeDOMCache() {
        console.log('🔍 开始缓存DOM元素...');
        
        try {
            // 必需元素
            const requiredElements = [
                'searchInput', 'clearBtn', 'refreshBtn', 'statisticsBtn', 
                'toggleCollapseBtn', 'advancedSearchBtn', 'searchInfo',
                'loadingIndicator', 'emptyState', 'resultsSection', 'resultsList'
            ];
            
            // 可选元素
            const optionalElements = [
                'advancedSearchContainer', 'closeAdvancedSearch', 
                'executeAdvancedSearch', 'resetAdvancedSearch'
            ];
            
            let missingRequired = 0;
            
            requiredElements.forEach(id => {
                try {
                    cacheElement(id, true);
                } catch (e) {
                    missingRequired++;
                    console.error(`❌ 必需元素 ${id} 缺失`);
                }
            });
            
            optionalElements.forEach(id => {
                cacheElement(id, false);
            });
            
            if (missingRequired > 0) {
                throw new Error(`${missingRequired} 个必需DOM元素缺失`);
            }
            
            console.log('✅ DOM元素缓存完成');
            return true;
            
        } catch (error) {
            console.error('❌ DOM元素缓存失败:', error);
            return false;
        }
    }
    
    // 安全的事件绑定函数
    function bindEvent(elementId, eventType, handler, description) {
        const element = elements[elementId];
        if (element) {
            try {
                element.addEventListener(eventType, handler);
                console.log(`✅ ${description} 事件绑定成功`);
                return true;
            } catch (error) {
                console.error(`❌ ${description} 事件绑定失败:`, error);
                return false;
            }
        } else {
            console.error(`❌ ${description} 事件绑定失败: 元素未找到`);
            return false;
        }
    }
    
    // 发送消息到VSCode扩展
    function sendMessage(type, data = {}) {
        try {
            const message = { type, ...data };
            console.log(`📤 发送消息:`, message);
            vscode.postMessage(message);
            return true;
        } catch (error) {
            console.error(`❌ 发送消息失败:`, error);
            return false;
        }
    }
    
    // 事件处理函数
    const eventHandlers = {
        // 搜索输入处理
        onSearchInput: function(event) {
            console.log('🔍 搜索输入事件触发');
            const query = event.target.value;
            
            if (state.searchTimeout) {
                clearTimeout(state.searchTimeout);
            }
            
            state.searchTimeout = setTimeout(() => {
                console.log(`🔍 执行搜索: "${query}"`);
                sendMessage('search', { query });
            }, 300);
            
            // 更新清除按钮状态
            updateClearButtonState(query);
        },
        
        // 搜索框快捷键
        onSearchKeydown: function(event) {
            if (event.key === 'Escape') {
                console.log('⌨️ ESC键清空搜索');
                elements.searchInput.value = '';
                sendMessage('search', { query: '' });
                updateClearButtonState('');
            }
        },
        
        // 清除按钮点击
        onClearClick: function() {
            console.log('🖱️ 清除按钮被点击');
            elements.searchInput.value = '';
            sendMessage('search', { query: '' });
            updateClearButtonState('');
            elements.searchInput.focus();
        },
        
        // 刷新按钮点击
        onRefreshClick: function() {
            console.log('🖱️ 刷新按钮被点击');
            showLoading(true, '刷新索引中...');
            setButtonLoading('refreshBtn', true);
            sendMessage('refresh');
        },
        
        // 统计按钮点击
        onStatisticsClick: function() {
            console.log('🖱️ 统计按钮被点击');
            sendMessage('showStatistics');
        },
        
        // 折叠按钮点击
        onToggleCollapseClick: function() {
            console.log('🖱️ 折叠按钮被点击');
            toggleAllGroups();
        },
        
        // 高级搜索按钮点击
        onAdvancedSearchClick: function() {
            console.log('🖱️ 高级搜索按钮被点击');
            const container = elements.advancedSearchContainer;
            if (container) {
                const isVisible = container.style.display !== 'none';
                if (isVisible) {
                    hideAdvancedSearch();
                } else {
                    showAdvancedSearch();
                }
            }
        },
        
        // 关闭高级搜索
        onCloseAdvancedSearch: function() {
            console.log('🖱️ 关闭高级搜索按钮被点击');
            hideAdvancedSearch();
        },
        
        // 执行高级搜索
        onExecuteAdvancedSearch: function() {
            console.log('🖱️ 执行高级搜索按钮被点击');
            executeAdvancedSearchQuery();
        },
        
        // 重置高级搜索
        onResetAdvancedSearch: function() {
            console.log('🖱️ 重置高级搜索按钮被点击');
            resetAdvancedSearchForm();
        }
    };
    
    // 绑定所有事件
    function bindAllEvents() {
        console.log('🔧 开始绑定所有事件...');
        
        let successCount = 0;
        let totalCount = 0;
        
        // 主要按钮事件
        const eventBindings = [
            { id: 'searchInput', event: 'input', handler: eventHandlers.onSearchInput, desc: '搜索输入' },
            { id: 'searchInput', event: 'keydown', handler: eventHandlers.onSearchKeydown, desc: '搜索快捷键' },
            { id: 'clearBtn', event: 'click', handler: eventHandlers.onClearClick, desc: '清除按钮' },
            { id: 'refreshBtn', event: 'click', handler: eventHandlers.onRefreshClick, desc: '刷新按钮' },
            { id: 'statisticsBtn', event: 'click', handler: eventHandlers.onStatisticsClick, desc: '统计按钮' },
            { id: 'toggleCollapseBtn', event: 'click', handler: eventHandlers.onToggleCollapseClick, desc: '折叠按钮' },
            { id: 'advancedSearchBtn', event: 'click', handler: eventHandlers.onAdvancedSearchClick, desc: '高级搜索按钮' },
            { id: 'closeAdvancedSearch', event: 'click', handler: eventHandlers.onCloseAdvancedSearch, desc: '关闭高级搜索' },
            { id: 'executeAdvancedSearch', event: 'click', handler: eventHandlers.onExecuteAdvancedSearch, desc: '执行高级搜索' },
            { id: 'resetAdvancedSearch', event: 'click', handler: eventHandlers.onResetAdvancedSearch, desc: '重置高级搜索' }
        ];
        
        eventBindings.forEach(binding => {
            totalCount++;
            if (bindEvent(binding.id, binding.event, binding.handler, binding.desc)) {
                successCount++;
            }
        });
        
        console.log(`🎯 事件绑定完成: ${successCount}/${totalCount} 成功`);
        
        // 绑定高级搜索输入框回车键
        bindAdvancedSearchInputs();
        
        // 初始化过滤器
        initializeFilters();
        
        return successCount === totalCount;
    }
    
    // 绑定高级搜索输入框
    function bindAdvancedSearchInputs() {
        const inputs = ['pathPattern', 'controllerPattern'];
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        executeAdvancedSearchQuery();
                    }
                });
                console.log(`✅ ${id} 回车键绑定成功`);
            }
        });
    }
    
    // 初始化过滤器
    function initializeFilters() {
        try {
            initializeMethodFilters();
            initializeTypeFilters();
            console.log('✅ 过滤器初始化完成');
        } catch (error) {
            console.error('❌ 过滤器初始化失败:', error);
        }
    }
    
    // 更新清除按钮状态
    function updateClearButtonState(query) {
        const clearBtn = elements.clearBtn;
        if (clearBtn) {
            clearBtn.style.display = query.trim() ? 'block' : 'none';
        }
    }
    
    // 设置按钮加载状态
    function setButtonLoading(elementId, loading) {
        const button = elements[elementId];
        if (button) {
            if (loading) {
                button.classList.add('loading');
            } else {
                button.classList.remove('loading');
            }
        }
    }
    
    // 显示/隐藏加载状态
    function showLoading(show, text = '处理中...') {
        const loadingIndicator = elements.loadingIndicator;
        const loadingText = document.getElementById('loadingText');
        const emptyState = elements.emptyState;
        const resultsSection = elements.resultsSection;
        
        if (show) {
            if (loadingText) {
                loadingText.textContent = text;
            }
            if (loadingIndicator) loadingIndicator.style.display = 'flex';
            if (emptyState) emptyState.style.display = 'none';
            if (resultsSection) resultsSection.style.display = 'none';
        } else {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }
    
    // 切换所有分组的折叠/展开状态
    function toggleAllGroups() {
        const groups = document.querySelectorAll('.controller-group');
        
        if (groups.length === 0) {
            console.warn('⚠️ 没有找到任何控制器组');
            return;
        }
        
        state.allCollapsed = !state.allCollapsed;
        console.log(`🔄 全局切换开始: 目标状态 ${state.allCollapsed ? '折叠' : '展开'}`);
        
        groups.forEach((group, index) => {
            const toggle = group.querySelector('.controller-toggle');
            const header = group.querySelector('.controller-header');
            const controllerName = header ? header.dataset.controller : `未知${index}`;
            
            if (state.allCollapsed) {
                group.classList.add('collapsed');
                if (toggle) toggle.textContent = '▶';
                console.log(`📂 折叠: ${controllerName}`);
            } else {
                group.classList.remove('collapsed');
                if (toggle) toggle.textContent = '▼';
                console.log(`📂 展开: ${controllerName}`);
            }
            
            // 强制触发重绘
            group.offsetHeight;
        });
        
        updateToggleButtonState();
        console.log(`✅ 全局切换完成: ${state.allCollapsed ? '折叠' : '展开'}所有控制器组 (共${groups.length}个)`);
    }
    
    // 更新折叠/展开按钮状态
    function updateToggleButtonState() {
        const toggleBtn = elements.toggleCollapseBtn;
        if (!toggleBtn) return;
        
        const icon = toggleBtn.querySelector('.btn-icon');
        if (!icon) return;
        
        if (state.allCollapsed) {
            icon.textContent = '🔀'; // 使用原始图标
            toggleBtn.title = '展开所有分组';
        } else {
            icon.textContent = '🔀'; // 使用原始图标
            toggleBtn.title = '折叠所有分组';
        }
        
        console.log(`🔄 更新全局折叠按钮状态: ${state.allCollapsed ? '折叠' : '展开'}`);
    }
    
    // 更新搜索信息
    function updateSearchInfo(query, totalCount) {
        const searchInfo = elements.searchInfo;
        if (!searchInfo) return;
        
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
        console.log(`🎨 开始渲染端点列表: ${endpoints.length} 个端点`);
        
        if (endpoints.length === 0) {
            showEmptyState(searchQuery);
            return;
        }
        
        // 按控制器分组
        const groupedEndpoints = groupEndpointsByController(endpoints);
        
        // 生成HTML
        const html = generateEndpointsHTML(groupedEndpoints, searchQuery);
        const resultsList = elements.resultsList;
        if (resultsList) {
            resultsList.innerHTML = html;
        }
        
        // 绑定点击事件
        bindEndpointClickEvents();
        bindControllerToggleEvents();
        
        // 验证折叠功能
        setTimeout(() => {
            validateCollapseFeature();
        }, 100);
        
        // 显示结果区域
        showLoading(false);
        const emptyState = elements.emptyState;
        const resultsSection = elements.resultsSection;
        if (emptyState) emptyState.style.display = 'none';
        if (resultsSection) resultsSection.style.display = 'block';
        
        console.log('✅ 端点列表渲染完成');
    }
    
    // 显示空状态
    function showEmptyState(searchQuery) {
        const emptyIcon = document.querySelector('.empty-icon');
        const emptyTitle = document.querySelector('.empty-title');
        const emptyDesc = document.querySelector('.empty-desc');
        
        if (searchQuery) {
            if (emptyIcon) emptyIcon.textContent = '🔍';
            if (emptyTitle) emptyTitle.textContent = '未找到匹配的结果';
            if (emptyDesc) emptyDesc.textContent = `没有找到匹配 "${searchQuery}" 的 API 端点，请尝试其他关键词`;
        } else {
            if (emptyIcon) emptyIcon.textContent = '🚀';
            if (emptyTitle) emptyTitle.textContent = '欢迎使用 API Navigator';
            if (emptyDesc) emptyDesc.textContent = '开始搜索或浏览项目中的 API 端点';
        }
        
        // 确保关闭loading状态
        showLoading(false);
        const emptyState = elements.emptyState;
        const resultsSection = elements.resultsSection;
        if (emptyState) emptyState.style.display = 'flex';
        if (resultsSection) resultsSection.style.display = 'none';
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
        console.log(`🔗 绑定 ${endpointItems.length} 个端点点击事件`);
        
        endpointItems.forEach(item => {
            item.addEventListener('click', () => {
                try {
                    const endpointData = JSON.parse(item.dataset.endpoint);
                    console.log('🖱️ 点击端点:', endpointData.path);
                    sendMessage('openEndpoint', { endpoint: endpointData });
                } catch (error) {
                    console.error('❌ 端点点击处理失败:', error);
                }
            });
        });
    }
    
    // 绑定控制器组折叠事件
    function bindControllerToggleEvents() {
        const controllerHeaders = document.querySelectorAll('.controller-header');
        console.log(`🔗 绑定 ${controllerHeaders.length} 个控制器折叠事件`);
        
        controllerHeaders.forEach((header, index) => {
            // 检查是否已经绑定过事件，避免重复绑定
            if (header.dataset.eventBound === 'true') {
                return;
            }
            
            // 添加事件监听器
            header.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                
                const group = this.closest('.controller-group');
                const toggle = this.querySelector('.controller-toggle');
                const controllerName = this.dataset.controller || `控制器${index}`;
                
                console.log(`🖱️ 点击控制器头部: ${controllerName}`);
                
                if (!group) {
                    console.error(`❌ 未找到控制器组 for ${controllerName}`);
                    return;
                }
                
                // 切换collapsed类
                group.classList.toggle('collapsed');
                
                // 强制触发重绘
                group.offsetHeight;
                
                // 更新切换图标
                if (group.classList.contains('collapsed')) {
                    if (toggle) toggle.textContent = '▶';
                    console.log(`📂 已折叠控制器组: ${controllerName}`);
                } else {
                    if (toggle) toggle.textContent = '▼';
                    console.log(`📂 已展开控制器组: ${controllerName}`);
                }
            });
            
            // 标记事件已绑定
            header.dataset.eventBound = 'true';
        });
    }
    
    // 验证折叠功能
    function validateCollapseFeature() {
        const groups = document.querySelectorAll('.controller-group');
        const headers = document.querySelectorAll('.controller-header');
        
        console.log(`🔍 折叠功能验证:`);
        console.log(`  - 控制器组数量: ${groups.length}`);
        console.log(`  - 控制器头部数量: ${headers.length}`);
        console.log(`  - 全局折叠按钮: ${elements.toggleCollapseBtn ? '✅ 找到' : '❌ 未找到'}`);
        
        headers.forEach((header, index) => {
            const hasEventBound = header.dataset.eventBound === 'true';
            const controllerName = header.dataset.controller || `控制器${index}`;
            console.log(`  - 控制器 ${index}: ${controllerName}, 事件绑定: ${hasEventBound ? '✅' : '❌'}`);
        });
        
        // 暴露测试函数到全局
        window.testCollapse = function() {
            console.log('🧪 开始折叠功能测试');
            const firstGroup = document.querySelector('.controller-group');
            if (firstGroup) {
                const header = firstGroup.querySelector('.controller-header');
                if (header) {
                    console.log('🖱️ 模拟点击第一个控制器头部');
                    header.click();
                } else {
                    console.error('❌ 未找到控制器头部');
                }
            } else {
                console.error('❌ 未找到控制器组');
            }
        };
        
        // 暴露全局折叠测试函数
        window.testGlobalCollapse = function() {
            console.log('🧪 开始全局折叠功能测试');
            if (elements.toggleCollapseBtn) {
                console.log('🖱️ 模拟点击全局折叠按钮');
                elements.toggleCollapseBtn.click();
            } else {
                console.error('❌ 全局折叠按钮未找到');
            }
        };
        
        console.log('💡 测试命令: testCollapse(), testGlobalCollapse()');
    }
    
    // 高级搜索功能
    function showAdvancedSearch() {
        const container = elements.advancedSearchContainer;
        if (container) {
            container.style.display = 'block';
            container.setAttribute('data-user-opened', 'true');
            setTimeout(() => {
                container.style.opacity = '1';
                container.style.transform = 'translateY(0)';
            }, 10);
            console.log('🔍 显示高级搜索区域');
        }
    }
    
    function hideAdvancedSearch() {
        const container = elements.advancedSearchContainer;
        if (container) {
            container.style.opacity = '0';
            container.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                container.style.display = 'none';
            }, 300);
            container.removeAttribute('data-user-opened');
            console.log('❌ 隐藏高级搜索区域');
        }
    }
    
    // 执行高级搜索查询
    function executeAdvancedSearchQuery() {
        console.log('🔍 执行高级搜索查询');
        
        // 收集搜索条件
        const filters = {};
        const options = {};
        let selectedMethods = [];
        
        // HTTP方法过滤
        const allMethodsSelected = document.querySelector('.method-filter.all-methods.active');
        if (!allMethodsSelected) {
            // 没有选择「全部」，收集具体选中的方法
            document.querySelectorAll('.method-filter:not(.all-methods).active').forEach(button => {
                selectedMethods.push(button.dataset.method);
            });
            console.log('选中的HTTP方法:', selectedMethods);
            if (selectedMethods.length > 0) {
                filters.methods = selectedMethods;
            }
        } else {
            console.log('选择了「全部」方法，不添加方法过滤条件');
        }
        
        // 路径类型过滤
        const selectedType = document.querySelector('.type-filter.active')?.dataset.type;
        if (selectedType && selectedType !== 'all') {
            filters.hasParameters = selectedType === 'param';
        }
        
        // 路径模式
        const pathPattern = document.getElementById('pathPattern')?.value?.trim();
        if (pathPattern) {
            filters.pathPattern = pathPattern;
        }
        
        // 控制器模式
        const controllerPattern = document.getElementById('controllerPattern')?.value?.trim();
        if (controllerPattern) {
            filters.controllerPattern = controllerPattern;
        }
        
        // 搜索选项
        options.caseSensitive = document.getElementById('caseSensitive')?.checked || false;
        options.useRegex = document.getElementById('useRegex')?.checked || false;
        
        console.log('🔍 执行高级搜索');
        console.log('📋 详细条件:', {
            filters: filters,
            options: options,
            selectedMethodsRaw: selectedMethods,
            selectedMethodsLength: selectedMethods.length
        });
        
        // 检查是否有任何搜索条件
        if (Object.keys(filters).length === 0) {
            console.log('⚪ 无过滤条件，显示所有端点');
            // 如果没有任何条件，显示所有端点
            sendMessage('search', { query: '' });
        } else {
            console.log('🎯 发送高级搜索请求:', JSON.stringify(filters, null, 2));
            // 发送高级搜索请求
            sendMessage('advancedSearch', { filters: filters, options: options });
        }
        
        // 隐藏搜索区域
        hideAdvancedSearch();
        
        // 显示搜索状态
        showLoading(true, '执行高级搜索...');
    }
    
    // 重置高级搜索表单
    function resetAdvancedSearchForm() {
        console.log('🔄 重置高级搜索表单');
        
        // 重置文本输入框
        const pathPatternInput = document.getElementById('pathPattern');
        const controllerPatternInput = document.getElementById('controllerPattern');
        if (pathPatternInput) pathPatternInput.value = '';
        if (controllerPatternInput) controllerPatternInput.value = '';
        
        // 重置HTTP方法过滤器（选择「全部」）
        document.querySelectorAll('.method-filter').forEach(filter => {
            if (filter.classList.contains('all-methods')) {
                filter.classList.add('active');
            } else {
                filter.classList.remove('active');
            }
        });
        
        // 重置类型过滤器（选择全部）
        document.querySelectorAll('.type-filter').forEach(filter => {
            filter.classList.remove('active');
        });
        const allTypeFilter = document.querySelector('.type-filter[data-type="all"]');
        if (allTypeFilter) allTypeFilter.classList.add('active');
        
        // 重置搜索选项
        const caseSensitiveInput = document.getElementById('caseSensitive');
        const useRegexInput = document.getElementById('useRegex');
        if (caseSensitiveInput) caseSensitiveInput.checked = false;
        if (useRegexInput) useRegexInput.checked = false;
        
        console.log('🔄 高级搜索表单已重置');
    }
    
    // 初始化方法过滤器
    function initializeMethodFilters() {
        const methodFilters = document.querySelectorAll('.method-filter');
        const allMethodsBtn = document.querySelector('.method-filter.all-methods');
        const specificMethodFilters = document.querySelectorAll('.method-filter:not(.all-methods)');
        
        console.log(`🔧 初始化方法过滤器: ${methodFilters.length} 个`);
        
        methodFilters.forEach(filter => {
            filter.addEventListener('click', () => {
                if (filter.classList.contains('all-methods')) {
                    // 点击「全部」按钮
                    const isActive = filter.classList.contains('active');
                    if (isActive) {
                        // 已选中「全部」，取消选择「全部」，激活所有具体方法
                        filter.classList.remove('active');
                        specificMethodFilters.forEach(f => f.classList.add('active'));
                        console.log('🔄 取消「全部」，选择所有具体方法');
                    } else {
                        // 未选中「全部」，选择「全部」，取消所有具体方法
                        filter.classList.add('active');
                        specificMethodFilters.forEach(f => f.classList.remove('active'));
                        console.log('🔄 选择「全部」，取消所有具体方法');
                    }
                } else {
                    // 点击具体方法按钮
                    filter.classList.toggle('active');
                    
                    // 检查是否有具体方法被选中
                    const activeSpecificFilters = document.querySelectorAll('.method-filter:not(.all-methods).active');
                    
                    if (activeSpecificFilters.length === 0) {
                        // 没有具体方法被选中，自动选择「全部」
                        if (allMethodsBtn) allMethodsBtn.classList.add('active');
                        console.log('🔄 没有具体方法选中，自动选择「全部」');
                    } else {
                        // 有具体方法被选中，取消「全部」选择
                        if (allMethodsBtn) allMethodsBtn.classList.remove('active');
                        console.log(`🔄 方法过滤器 ${filter.dataset.method} 状态: ${filter.classList.contains('active') ? '启用' : '禁用'}`);
                    }
                }
            });
        });
        
        console.log('✅ 方法过滤器初始化完成');
    }
    
    // 初始化类型过滤器
    function initializeTypeFilters() {
        const typeFilters = document.querySelectorAll('.type-filter');
        console.log(`🔧 初始化类型过滤器: ${typeFilters.length} 个`);
        
        typeFilters.forEach(filter => {
            filter.addEventListener('click', () => {
                // 类型过滤器只能选择一个
                typeFilters.forEach(f => f.classList.remove('active'));
                filter.classList.add('active');
                console.log(`🔄 类型过滤器选择: ${filter.dataset.type}`);
            });
        });
        
        console.log('✅ 类型过滤器初始化完成');
    }
    
    // 监听来自扩展的消息
    window.addEventListener('message', event => {
        const message = event.data;
        console.log('📥 收到消息:', message);
        
        switch (message.type) {
            case 'updateData':
                state.currentEndpoints = message.endpoints;
                // 更新搜索信息
                updateSearchInfo(message.searchQuery, message.totalCount);
                // 渲染端点列表
                renderEndpoints(message.endpoints, message.searchQuery);
                
                // 确保重置所有loading状态
                showLoading(false);
                setButtonLoading('refreshBtn', false);
                
                // 强制确保高级搜索弹窗处于隐藏状态（除非用户主动打开）
                const advancedContainer = elements.advancedSearchContainer;
                if (advancedContainer) {
                    const wasUserOpened = advancedContainer.getAttribute('data-user-opened') === 'true';
                    if (!wasUserOpened) {
                        advancedContainer.style.display = 'none';
                        advancedContainer.style.opacity = '0';
                        advancedContainer.style.transform = 'translateY(-10px)';
                    }
                }
                
                console.log(`📊 更新数据完成: ${message.endpoints.length} 个端点`);
                break;
            case 'showLoading':
                showLoading(true, message.text || '处理中...');
                break;
            case 'hideLoading':
                showLoading(false);
                break;
        }
    });
    
    // 主初始化函数
    function initialize() {
        console.log('🚀 开始初始化 API Navigator');
        
        try {
            // 1. 缓存DOM元素
            if (!initializeDOMCache()) {
                throw new Error('DOM元素缓存失败');
            }
            
            // 2. 绑定事件
            if (!bindAllEvents()) {
                throw new Error('事件绑定失败');
            }
            
            // 3. 初始化状态
            updateClearButtonState('');
            updateToggleButtonState();
            
            // 4. 隐藏高级搜索
            hideAdvancedSearch();
            
            // 5. 通知扩展端准备就绪
            sendMessage('webviewReady');
            
            // 6. 请求初始数据
            setTimeout(() => {
                if (state.currentEndpoints.length === 0) {
                    sendMessage('requestData');
                }
            }, 1000);
            
            // 7. 聚焦搜索框
            setTimeout(() => {
                if (elements.searchInput) {
                    elements.searchInput.focus();
                }
            }, 100);
            
            state.isInitialized = true;
            console.log('🎉 API Navigator 初始化完成');
            
            // 暴露调试函数
            window.testButtons = function() {
                console.log('🧪 测试所有按钮功能');
                Object.keys(elements).forEach(id => {
                    const element = elements[id];
                    if (element && element.tagName === 'BUTTON') {
                        console.log(`🔘 按钮 ${id}:`, {
                            exists: !!element,
                            visible: element.style.display !== 'none',
                            enabled: !element.disabled,
                            hasEvents: element.onclick !== null
                        });
                    }
                });
            };
            
            console.log('💡 调试命令: testButtons() - 测试所有按钮状态');
            
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            // 显示错误信息给用户
            document.body.innerHTML = `
                <div style="padding: 20px; color: red;">
                    <h3>初始化失败</h3>
                    <p>错误: ${error.message}</p>
                    <p>请刷新页面或重新加载扩展</p>
                </div>
            `;
        }
    }
    
    // 确保在DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
        console.log('📅 等待DOM加载完成...');
    } else {
        // DOM已经加载完成，立即初始化
        console.log('📅 DOM已就绪，立即初始化');
        initialize();
    }
    
    console.log('📄 API Navigator JavaScript 文件加载完成');
    
})(); 