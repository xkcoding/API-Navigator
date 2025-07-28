import * as fs from 'fs';
import * as path from 'path';
import { VersionCompatibility, SemanticVersion } from './types';

/**
 * 版本管理器 - 负责插件版本管理和缓存兼容性检查
 */
export class VersionManager {
    private static readonly CACHE_FORMAT_VERSION = '1.0.0';
    private currentPluginVersion: string = '';

    constructor() {
        this.loadCurrentPluginVersion();
    }

    /**
     * 从package.json读取当前插件版本
     */
    private loadCurrentPluginVersion(): void {
        try {
            const packageJsonPath = path.join(__dirname, '../../package.json');
            
            if (fs.existsSync(packageJsonPath)) {
                const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
                const packageData = JSON.parse(packageContent);
                this.currentPluginVersion = packageData.version || '0.0.0';
                console.log(`✅ 当前插件版本: ${this.currentPluginVersion}`);
            } else {
                console.log('⚠️ package.json未找到，使用默认版本');
                this.currentPluginVersion = '0.0.0';
            }
        } catch (error) {
            console.error('❌ 读取package.json失败:', error);
            this.currentPluginVersion = '0.0.0';
        }
    }

    /**
     * 获取当前插件版本
     */
    public getCurrentPluginVersion(): string {
        return this.currentPluginVersion;
    }

    /**
     * 获取缓存格式版本
     */
    public getCacheFormatVersion(): string {
        return VersionManager.CACHE_FORMAT_VERSION;
    }

    /**
     * 检查缓存版本兼容性
     */
    public checkVersionCompatibility(cachedPluginVersion: string): VersionCompatibility {
        const currentVersion = this.currentPluginVersion;

        console.log(`🔍 版本兼容性检查:`);
        console.log(`  缓存版本: ${cachedPluginVersion}`);
        console.log(`  当前版本: ${currentVersion}`);

        // 解析版本号 (major.minor.patch)
        const cachedSemver = this.parseVersion(cachedPluginVersion);
        const currentSemver = this.parseVersion(currentVersion);

        // 版本兼容性规则
        if (cachedSemver.major !== currentSemver.major) {
            // 主版本号不同 - 不兼容
            console.log(`❌ 主版本号变更 (${cachedSemver.major} → ${currentSemver.major}) - 不兼容`);
            return currentSemver.major > cachedSemver.major 
                ? VersionCompatibility.INCOMPATIBLE 
                : VersionCompatibility.DOWNGRADE;
        }

        if (cachedSemver.minor !== currentSemver.minor) {
            // 次版本号不同 - 可能需要升级处理
            if (currentSemver.minor > cachedSemver.minor) {
                console.log(`⬆️ 次版本号升级 (${cachedSemver.minor} → ${currentSemver.minor}) - 需要升级`);
                return VersionCompatibility.UPGRADE;
            } else {
                console.log(`⬇️ 次版本号降级 (${cachedSemver.minor} → ${currentSemver.minor}) - 不兼容`);
                return VersionCompatibility.DOWNGRADE;
            }
        }

        // 补丁版本变更 - 兼容
        if (cachedSemver.patch !== currentSemver.patch) {
            console.log(`🔧 补丁版本变更 (${cachedSemver.patch} → ${currentSemver.patch}) - 兼容`);
        } else {
            console.log(`✅ 版本完全匹配 - 兼容`);
        }

        return VersionCompatibility.COMPATIBLE;
    }

    /**
     * 解析语义化版本号
     */
    private parseVersion(version: string): SemanticVersion {
        const parts = version.split('.').map(part => parseInt(part, 10) || 0);
        return {
            major: parts[0] || 0,
            minor: parts[1] || 0,
            patch: parts[2] || 0
        };
    }

    /**
     * 判断是否需要清除缓存
     */
    public shouldClearCache(compatibility: VersionCompatibility): boolean {
        return compatibility === VersionCompatibility.INCOMPATIBLE || 
               compatibility === VersionCompatibility.DOWNGRADE;
    }

    /**
     * 判断是否需要迁移缓存
     */
    public shouldMigrateCache(compatibility: VersionCompatibility): boolean {
        return compatibility === VersionCompatibility.UPGRADE;
    }

    /**
     * 记录版本变更日志
     */
    public logVersionChange(oldVersion: string, newVersion: string, action: string): void {
        console.log(`📋 版本变更记录:`);
        console.log(`  从版本: ${oldVersion}`);
        console.log(`  到版本: ${newVersion}`);
        console.log(`  执行操作: ${action}`);
        console.log(`  时间戳: ${new Date().toISOString()}`);
    }
} 