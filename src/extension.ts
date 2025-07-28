import * as vscode from 'vscode';
import { ApiNavigatorProvider } from './ui/ApiNavigatorProvider';
import { ApiIndexer } from './core/ApiIndexer';
import { WorkerPool } from './core/WorkerPool';
import { SearchProvider } from './ui/SearchProvider';
import { PersistentIndexManager } from './core/PersistentIndexManager';
import { ApiNavigatorWebView } from './ui/ApiNavigatorWebView';

// 全局引用，用于deactivate清理
let globalCacheManager: PersistentIndexManager | null = null;

export async function activate(context: vscode.ExtensionContext) {
    console.log('API Navigator 插件正在激活...');

    // 检测工作区是否包含Java文件
    await checkAndSetJavaContext();

    // 初始化核心组件
    const workerPool = new WorkerPool(4);
    const apiIndexer = new ApiIndexer(workerPool);
    
    // 初始化持久化缓存管理器
    const cacheManager = new PersistentIndexManager(apiIndexer);
    globalCacheManager = cacheManager;
    
    // 初始化UI组件，传入缓存管理器
    const apiNavigatorProvider = new ApiNavigatorProvider(apiIndexer, cacheManager);
    const searchProvider = new SearchProvider(apiIndexer, context.extensionUri);

    // TreeView已移除，现在只使用WebView

    // 创建并注册WebView Provider
    const webViewProvider = new ApiNavigatorWebView(context.extensionUri, apiIndexer);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ApiNavigatorWebView.viewType, webViewProvider)
    );

    // 注册命令
    const commands = [
        vscode.commands.registerCommand('apiNavigator.refresh', () => {
            apiNavigatorProvider.refresh();
        }),
        
        vscode.commands.registerCommand('apiNavigator.search', () => {
            // 保持原有的QuickPick搜索功能 (CMD+\ 快捷键)
            searchProvider.showQuickPick();
        }),

        vscode.commands.registerCommand('apiNavigator.openApi', (endpoint) => {
            if (endpoint && endpoint.location) {
                goToLocation(endpoint.location);
            }
        }),



        // 缓存管理命令
        vscode.commands.registerCommand('apiNavigator.clearCache', () => {
            apiNavigatorProvider.clearCacheCommand();
        }),

        vscode.commands.registerCommand('apiNavigator.showCacheInfo', () => {
            apiNavigatorProvider.showCacheInfoCommand();
        }),

        vscode.commands.registerCommand('apiNavigator.refreshCache', () => {
            apiNavigatorProvider.manualRefreshCommand();
        }),

        // 统计信息命令
        vscode.commands.registerCommand('apiNavigator.showStatistics', () => {
            searchProvider.showStatistics();
        }),

        // 高级搜索命令
        vscode.commands.registerCommand('apiNavigator.advancedSearch', () => {
            searchProvider.showAdvancedSearch();
        })
    ];

    // 添加到上下文
    context.subscriptions.push(...commands);

    // 初始化索引（使用缓存）
    try {
        await cacheManager.initializeWithCache();
        console.log('API Navigator 插件激活完成');
    } catch (error) {
        console.error('API Navigator 初始化失败:', error);
        vscode.window.showErrorMessage(`API Navigator 初始化失败: ${error}`);
    }
}

async function goToLocation(location: any) {
    try {
        console.log('跳转位置信息:', {
            filePath: location.filePath,
            startLine: location.startLine,
            endLine: location.endLine,
            startColumn: location.startColumn,
            endColumn: location.endColumn
        });
        
        const document = await vscode.workspace.openTextDocument(location.filePath);
        const editor = await vscode.window.showTextDocument(document);
        
        const position = new vscode.Position(location.startLine - 1, location.startColumn || 0);
        const range = new vscode.Range(position, position);
        
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        
        console.log('跳转到位置:', { line: position.line + 1, character: position.character });
    } catch (error) {
        console.error('跳转到代码位置失败:', error);
        vscode.window.showErrorMessage(`无法跳转到代码位置: ${error}`);
    }
}

async function checkAndSetJavaContext() {
    try {
        // 查找工作区中的Java文件
        const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/node_modules/**', 1);
        const hasJavaFiles = javaFiles.length > 0;
        
        // 设置上下文，用于控制面板显示
        await vscode.commands.executeCommand('setContext', 'workspaceHasJavaFiles', hasJavaFiles);
        
        console.log(`检测到Java文件: ${hasJavaFiles}, 文件数量: ${javaFiles.length}`);
    } catch (error) {
        console.error('检测Java文件失败:', error);
        // 默认设置为true，确保面板显示
        await vscode.commands.executeCommand('setContext', 'workspaceHasJavaFiles', true);
    }
}

/**
 * 扩展停用时的清理函数
 */
export function deactivate() {
    console.log('API Navigator 插件正在停用...');
    
    try {
        // 保存当前缓存状态
        if (globalCacheManager) {
            globalCacheManager.saveCurrentStateToCache().catch(error => {
                console.error('保存缓存状态失败:', error);
            });
            
            // 清理资源
            globalCacheManager.dispose();
            globalCacheManager = null;
        }
        
        console.log('API Navigator 插件停用完成');
    } catch (error) {
        console.error('插件停用时发生错误:', error);
    }
} 