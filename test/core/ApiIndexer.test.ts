import { ApiIndexer } from '../../src/core/ApiIndexer';
import { WorkerPool } from '../../src/core/WorkerPool';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Mock 依赖
jest.mock('../../src/core/WorkerPool');
jest.mock('fs');
jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/mock/workspace' },
        name: 'test-workspace'
      }
    ]
  },
  RelativePattern: jest.fn(),
  FileSystemWatcher: jest.fn(),
  window: {
    setStatusBarMessage: jest.fn()
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockVscode = vscode as jest.Mocked<typeof vscode>;

describe('ApiIndexer', () => {
  let apiIndexer: ApiIndexer;
  let mockWorkerPool: jest.Mocked<WorkerPool>;

  beforeEach(() => {
    mockWorkerPool = new WorkerPool() as jest.Mocked<WorkerPool>;
    apiIndexer = new ApiIndexer(mockWorkerPool);
    
    // 重置所有 mock
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('应该成功初始化索引器', async () => {
      // Mock 文件系统
      mockFs.promises.readdir = jest.fn()
        .mockResolvedValueOnce(['src'] as any)
        .mockResolvedValueOnce(['main'] as any)
        .mockResolvedValueOnce(['java'] as any)
        .mockResolvedValueOnce(['Controller.java'] as any);

      mockFs.promises.stat = jest.fn().mockResolvedValue({
        isDirectory: () => true
      } as any);

      mockFs.promises.readFile = jest.fn().mockResolvedValue('mock java content');

      // Mock WorkerPool
      mockWorkerPool.execute = jest.fn().mockResolvedValue([
        createMockApiEndpoint({
          id: 'test-1',
          path: '/api/test',
          method: 'GET'
        })
      ]);

      // Mock 文件监控
      const mockWatcher = {
        onDidCreate: jest.fn(),
        onDidChange: jest.fn(),
        onDidDelete: jest.fn()
      };
      mockVscode.workspace.createFileSystemWatcher = jest.fn().mockReturnValue(mockWatcher);

      await apiIndexer.initialize();

      expect(mockWorkerPool.execute).toHaveBeenCalled();
      expect(mockVscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    });

    it('应该处理没有工作区的情况', async () => {
      mockVscode.workspace.workspaceFolders = [];

      await expect(apiIndexer.initialize()).resolves.not.toThrow();
      expect(mockWorkerPool.execute).not.toHaveBeenCalled();
    });

    it('应该处理文件扫描错误', async () => {
      mockFs.promises.readdir = jest.fn().mockRejectedValue(new Error('File system error'));

      await expect(apiIndexer.initialize()).rejects.toThrow();
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // 设置测试数据
      const mockEndpoints = [
        createMockApiEndpoint({
          id: 'user-1',
          path: '/api/users',
          method: 'GET',
          controllerClass: 'UserController'
        }),
        createMockApiEndpoint({
          id: 'user-2',
          path: '/api/users/{id}',
          method: 'GET',
          controllerClass: 'UserController'
        }),
        createMockApiEndpoint({
          id: 'product-1',
          path: '/api/products',
          method: 'POST',
          controllerClass: 'ProductController'
        })
      ];

      // 使用反射设置内部状态
      (apiIndexer as any).endpoints = new Map(
        mockEndpoints.map(endpoint => [endpoint.id, endpoint])
      );

      // 设置路径索引
      const pathIndex = new Map<string, Set<string>>();
      pathIndex.set('/api/users', new Set(['user-1']));
      pathIndex.set('/api/users/{id}', new Set(['user-2']));
      pathIndex.set('/api/products', new Set(['product-1']));
      (apiIndexer as any).pathIndex = pathIndex;

      // 设置类索引
      const classIndex = new Map<string, Set<string>>();
      classIndex.set('UserController', new Set(['user-1', 'user-2']));
      classIndex.set('ProductController', new Set(['product-1']));
      (apiIndexer as any).classIndex = classIndex;
    });

    it('应该能按路径搜索端点', async () => {
      const results = await apiIndexer.search('users');

      expect(results).toHaveLength(2);
      expect(results[0].path).toContain('users');
      expect(results[1].path).toContain('users');
    });

    it('应该能按控制器类名搜索', async () => {
      const results = await apiIndexer.search('UserController');

      expect(results).toHaveLength(2);
      expect(results[0].controllerClass).toBe('UserController');
      expect(results[1].controllerClass).toBe('UserController');
    });

    it('应该能按 HTTP 方法过滤', async () => {
      const results = await apiIndexer.search('POST');

      expect(results).toHaveLength(1);
      expect(results[0].method).toBe('POST');
    });

    it('应该处理空搜索查询', async () => {
      const results = await apiIndexer.search('');

      expect(results).toHaveLength(3); // 返回所有端点
    });

    it('应该处理没有匹配结果的搜索', async () => {
      const results = await apiIndexer.search('nonexistent');

      expect(results).toHaveLength(0);
    });

    it('应该支持模糊搜索', async () => {
      const results = await apiIndexer.search('prod');

      expect(results).toHaveLength(1);
      expect(results[0].path).toContain('products');
    });
  });

  describe('addEndpoint', () => {
    it('应该能添加新端点', () => {
      const newEndpoint = createMockApiEndpoint({
        id: 'new-endpoint',
        path: '/api/new',
        method: 'PUT'
      });

      apiIndexer.addEndpoint(newEndpoint);

      const endpoints = (apiIndexer as any).endpoints;
      expect(endpoints.has('new-endpoint')).toBe(true);
      expect(endpoints.get('new-endpoint')).toEqual(newEndpoint);
    });

    it('应该更新路径索引', () => {
      const newEndpoint = createMockApiEndpoint({
        id: 'new-endpoint',
        path: '/api/new',
        method: 'PUT'
      });

      apiIndexer.addEndpoint(newEndpoint);

      const pathIndex = (apiIndexer as any).pathIndex;
      expect(pathIndex.has('/api/new')).toBe(true);
      expect(pathIndex.get('/api/new').has('new-endpoint')).toBe(true);
    });

    it('应该更新类索引', () => {
      const newEndpoint = createMockApiEndpoint({
        id: 'new-endpoint',
        path: '/api/new',
        method: 'PUT',
        controllerClass: 'NewController'
      });

      apiIndexer.addEndpoint(newEndpoint);

      const classIndex = (apiIndexer as any).classIndex;
      expect(classIndex.has('NewController')).toBe(true);
      expect(classIndex.get('NewController').has('new-endpoint')).toBe(true);
    });
  });

  describe('removeEndpoint', () => {
    beforeEach(() => {
      const endpoint = createMockApiEndpoint({
        id: 'test-endpoint',
        path: '/api/test',
        method: 'DELETE',
        controllerClass: 'TestController'
      });

      apiIndexer.addEndpoint(endpoint);
    });

    it('应该能删除端点', () => {
      apiIndexer.removeEndpoint('test-endpoint');

      const endpoints = (apiIndexer as any).endpoints;
      expect(endpoints.has('test-endpoint')).toBe(false);
    });

    it('应该更新索引', () => {
      apiIndexer.removeEndpoint('test-endpoint');

      const pathIndex = (apiIndexer as any).pathIndex;
      const classIndex = (apiIndexer as any).classIndex;
      
      expect(pathIndex.get('/api/test')?.has('test-endpoint')).toBe(false);
      expect(classIndex.get('TestController')?.has('test-endpoint')).toBe(false);
    });
  });

  describe('getAllEndpoints', () => {
    it('应该返回所有端点', () => {
      const endpoint1 = createMockApiEndpoint({ id: 'ep1' });
      const endpoint2 = createMockApiEndpoint({ id: 'ep2' });

      apiIndexer.addEndpoint(endpoint1);
      apiIndexer.addEndpoint(endpoint2);

      const allEndpoints = apiIndexer.getAllEndpoints();

      expect(allEndpoints).toHaveLength(2);
      expect(allEndpoints).toContain(endpoint1);
      expect(allEndpoints).toContain(endpoint2);
    });

    it('应该返回空数组当没有端点时', () => {
      const allEndpoints = apiIndexer.getAllEndpoints();

      expect(allEndpoints).toHaveLength(0);
    });
  });

  describe('getEndpointsByController', () => {
    beforeEach(() => {
      const endpoint1 = createMockApiEndpoint({
        id: 'ep1',
        controllerClass: 'UserController'
      });
      const endpoint2 = createMockApiEndpoint({
        id: 'ep2',
        controllerClass: 'UserController'
      });
      const endpoint3 = createMockApiEndpoint({
        id: 'ep3',
        controllerClass: 'ProductController'
      });

      apiIndexer.addEndpoint(endpoint1);
      apiIndexer.addEndpoint(endpoint2);
      apiIndexer.addEndpoint(endpoint3);
    });

    it('应该返回指定控制器的端点', () => {
      const userEndpoints = apiIndexer.getEndpointsByController('UserController');

      expect(userEndpoints).toHaveLength(2);
      userEndpoints.forEach(endpoint => {
        expect(endpoint.controllerClass).toBe('UserController');
      });
    });

    it('应该处理不存在的控制器', () => {
      const endpoints = apiIndexer.getEndpointsByController('NonExistentController');

      expect(endpoints).toHaveLength(0);
    });
  });

  describe('dispose', () => {
    it('应该清理资源', () => {
      const mockWatcher = {
        dispose: jest.fn()
      };
      (apiIndexer as any).fileWatcher = mockWatcher;

      apiIndexer.dispose();

      expect(mockWatcher.dispose).toHaveBeenCalled();
    });
  });
});

// 测试工具函数
function createMockApiEndpoint(overrides: any = {}) {
  return {
    id: 'default-id',
    method: 'GET',
    path: '/api/default',
    classMapping: '',
    methodMapping: '/api/default',
    controllerClass: 'DefaultController',
    methodName: 'defaultMethod',
    parameters: [],
    location: {
      filePath: '/mock/DefaultController.java',
      startLine: 1,
      endLine: 10,
      startColumn: 0,
      endColumn: 0
    },
    annotations: [],
    pathComposition: {
      classPath: '',
      methodPath: '/api/default',
      fullPath: '/api/default',
      hasClassMapping: false,
      hasMethodMapping: true
    },
    ...overrides
  };
} 