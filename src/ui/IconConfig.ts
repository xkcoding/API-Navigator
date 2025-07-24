import { HttpMethod } from '../core/types';

/**
 * 统一的图标配置
 * 确保面板树视图和快速搜索使用相同的图标系统
 */
export class IconConfig {
    /**
     * HTTP方法图标映射 - 使用emoji以确保跨平台一致性
     */
    public static readonly HTTP_METHOD_EMOJIS: Record<HttpMethod, string> = {
        GET: '🔍',    // 查询/获取数据
        POST: '📝',   // 创建/提交数据  
        PUT: '🔄',    // 更新/替换数据
        DELETE: '🗑️', // 删除数据
        PATCH: '⚡'   // 部分更新数据
    };

    /**
     * HTTP方法图标映射 - VSCode主题图标
     */
    public static readonly HTTP_METHOD_THEME_ICONS: Record<HttpMethod, string> = {
        GET: 'arrow-down',        // 下载/获取
        POST: 'plus',             // 创建/添加
        PUT: 'pencil',            // 编辑/更新
        DELETE: 'trash',          // 删除
        PATCH: 'diff-modified'    // 修改
    };

    /**
     * 获取HTTP方法的emoji图标
     */
    public static getMethodEmoji(method: HttpMethod): string {
        return this.HTTP_METHOD_EMOJIS[method] || '❓';
    }

    /**
     * 获取HTTP方法的主题图标
     */
    public static getMethodThemeIcon(method: HttpMethod): string {
        return this.HTTP_METHOD_THEME_ICONS[method] || 'circle-outline';
    }

    /**
     * 获取HTTP方法的排序优先级
     */
    public static getMethodOrder(method: HttpMethod): number {
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
     * 格式化方法显示（包含图标和文本）
     */
    public static formatMethodWithIcon(method: HttpMethod, useEmoji: boolean = true): string {
        const icon = useEmoji ? this.getMethodEmoji(method) : `$(${this.getMethodThemeIcon(method)})`;
        return `${icon} ${method}`;
    }
} 