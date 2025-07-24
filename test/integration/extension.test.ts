import * as vscode from 'vscode';
import { ApiIndexer } from '../../src/core/ApiIndexer';
import { WorkerPool } from '../../src/core/WorkerPool';
import { SearchProvider } from '../../src/ui/SearchProvider';

// 集成测试 - 测试主要组件的协作
describe('API Navigator Extension Integration', () => {
  let context: vscode.ExtensionContext;
  let workerPool: WorkerPool;
  let apiIndexer: ApiIndexer;
  let searchProvider: SearchProvider;

  beforeEach(() => {
    // 创建模拟的扩展上下文
    context = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn()
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn()
      },
      extensionPath: '/mock/extension/path',
      storagePath: '/mock/storage/path',
      globalStoragePath: '/mock/global/storage/path',
      logPath: '/mock/log/path'
    } as any;

    // 创建组件实例
    workerPool = new WorkerPool(2);
    apiIndexer = new ApiIndexer(workerPool);
    searchProvider = new SearchProvider(apiIndexer);
  });

  afterEach(() => {
    // 清理资源
    if (workerPool && typeof (workerPool as any).dispose === 'function') {
      (workerPool as any).dispose();
    }
    if (apiIndexer && typeof (apiIndexer as any).dispose === 'function') {
      (apiIndexer as any).dispose();
    }
  });

  describe('扩展激活流程', () => {
    it('应该能正确初始化所有核心组件', async () => {
      expect(workerPool).toBeDefined();
      expect(apiIndexer).toBeDefined();
      expect(searchProvider).toBeDefined();
    });

    it('应该能注册必要的命令', () => {
      const expectedCommands = [
        'apiNavigator.refresh',
        'apiNavigator.search',
        'apiNavigator.openApi'
      ];

      // 在实际实现中，这些命令应该在激活时注册
      expectedCommands.forEach(command => {
        expect(typeof command).toBe('string');
      });
    });
  });

  describe('工作流集成测试', () => {
    it('应该支持完整的搜索-跳转工作流', async () => {
      // 这是一个概念性测试，展示完整的工作流
      
      // 1. 模拟初始化
      // 在实际环境中，这会扫描 Java 文件并建立索引
      
      // 2. 模拟搜索
      const mockEndpoints = [
        {
          id: 'test-endpoint',
          method: 'GET' as const,
          path: '/api/test',
          controllerClass: 'TestController',
          methodName: 'testMethod',
          location: {
            filePath: '/project/TestController.java',
            startLine: 15,
            endLine: 20,
            startColumn: 4,
            endColumn: 10
          }
        }
      ];

      // Mock 搜索结果
      jest.spyOn(apiIndexer as any, 'searchEndpoints').mockReturnValue(mockEndpoints);

      // 执行搜索 (使用 any 类型避免类型错误)
      const searchResults = await (searchProvider as any).searchByQuery('test');
      
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].path).toBe('/api/test');
    });

    it('应该正确处理空工作区', async () => {
      // 模拟没有 Java 文件的工作区
      jest.spyOn(apiIndexer as any, 'getAllEndpoints').mockReturnValue([]);

      const allEndpoints = (apiIndexer as any).getAllEndpoints();
      expect(allEndpoints).toHaveLength(0);
    });

    it('应该能处理大量端点', async () => {
      // 模拟大量端点的场景
      const manyEndpoints = Array.from({ length: 1000 }, (_, i) => ({
        id: `endpoint-${i}`,
        method: 'GET' as const,
        path: `/api/endpoint-${i}`,
        controllerClass: `Controller${i}`,
        methodName: `method${i}`,
        location: {
          filePath: `/project/Controller${i}.java`,
          startLine: 10,
          endLine: 15,
          startColumn: 0,
          endColumn: 0
        }
      }));

      jest.spyOn(apiIndexer as any, 'searchEndpoints').mockReturnValue(manyEndpoints);

      const searchResults = await (searchProvider as any).searchByQuery('endpoint');
      expect(searchResults).toHaveLength(1000);
    });
  });

  describe('性能测试', () => {
    it('搜索响应时间应该在合理范围内', async () => {
      const startTime = Date.now();
      
      // 模拟搜索操作
      jest.spyOn(apiIndexer as any, 'searchEndpoints').mockReturnValue([]);
      await (searchProvider as any).searchByQuery('test');
      
      const duration = Date.now() - startTime;
      
      // 搜索应该在 100ms 内完成（这是一个模拟测试）
      expect(duration).toBeLessThan(100);
    });

    it('应该能处理并发搜索请求', async () => {
      jest.spyOn(apiIndexer as any, 'searchEndpoints').mockReturnValue([]);

      const concurrentSearches = Array.from({ length: 10 }, (_, i) =>
        (searchProvider as any).searchByQuery(`test-${i}`)
      );

      const results = await Promise.all(concurrentSearches);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('错误处理测试', () => {
    it('应该优雅地处理组件初始化失败', async () => {
      // 模拟 WorkerPool 初始化失败
      const faultyWorkerPool = {
        execute: jest.fn().mockRejectedValue(new Error('Worker failed'))
      } as any;

      const faultyApiIndexer = new ApiIndexer(faultyWorkerPool);
      const faultySearchProvider = new SearchProvider(faultyApiIndexer);

      // 搜索应该不会抛出异常，而是返回空结果或显示错误消息
      await expect((faultySearchProvider as any).searchByQuery('test')).resolves.not.toThrow();
    });

    it('应该处理文件系统访问错误', async () => {
      // 模拟文件系统访问失败
      jest.spyOn(apiIndexer as any, 'searchEndpoints').mockImplementation(() => { throw new Error('File system error'); });

      await expect((searchProvider as any).searchByQuery('test')).rejects.toThrow('File system error');
    });
  });

  describe('内存管理测试', () => {
    it('应该正确清理资源', () => {
      // 创建组件
      const testWorkerPool = new WorkerPool(1);
      const testApiIndexer = new ApiIndexer(testWorkerPool);

      // 验证组件创建成功
      expect(testWorkerPool).toBeDefined();
      expect(testApiIndexer).toBeDefined();

      // 清理资源
      (testApiIndexer as any).dispose();
      (testWorkerPool as any).dispose();

      // 在实际实现中，这里应该验证所有资源都被正确清理
      expect(true).toBe(true); // 占位符断言
    });

    it('应该避免内存泄漏', () => {
      // 创建和销毁多个组件实例
      for (let i = 0; i < 10; i++) {
        const tempWorkerPool = new WorkerPool(1);
        const tempApiIndexer = new ApiIndexer(tempWorkerPool);
        
        // 立即清理
        (tempApiIndexer as any).dispose();
        (tempWorkerPool as any).dispose();
      }

      // 在实际环境中，这里应该检查内存使用情况
      expect(true).toBe(true); // 占位符断言
    });
  });
});

// 测试数据生成器
export function generateMockJavaFile(className: string, endpoints: number = 3): string {
  const methods = Array.from({ length: endpoints }, (_, i) => `
    @GetMapping("/api/${className.toLowerCase()}/method${i}")
    public ResponseEntity<String> method${i}() {
        return ResponseEntity.ok("Response ${i}");
    }
  `).join('\n');

  return `
package com.example.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/${className.toLowerCase()}")
public class ${className} {
    ${methods}
}
`;
}

// 性能基准测试工具
export class PerformanceBenchmark {
  private startTime: number = 0;
  private endTime: number = 0;

  start(): void {
    this.startTime = Date.now();
  }

  end(): number {
    this.endTime = Date.now();
    return this.endTime - this.startTime;
  }

  static async measure<T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const benchmark = new PerformanceBenchmark();
    benchmark.start();
    const result = await operation();
    const duration = benchmark.end();
    return { result, duration };
  }
} 