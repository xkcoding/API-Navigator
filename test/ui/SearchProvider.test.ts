import '../setup';
import { SearchProvider } from '../../src/ui/SearchProvider';
import { ApiIndexer } from '../../src/core/ApiIndexer';
import { WorkerPool } from '../../src/core/WorkerPool';
import * as vscode from 'vscode';

// Mock 依赖
jest.mock('../../src/core/ApiIndexer');
jest.mock('../../src/core/WorkerPool');

const MockedApiIndexer = ApiIndexer as jest.MockedClass<typeof ApiIndexer>;
const MockedWorkerPool = WorkerPool as jest.MockedClass<typeof WorkerPool>;

describe('SearchProvider', () => {
  let searchProvider: SearchProvider;
  let mockApiIndexer: jest.Mocked<ApiIndexer>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // 创建mock WorkerPool实例
    const mockWorkerPool = new MockedWorkerPool() as jest.Mocked<WorkerPool>;
    
    // 创建mock ApiIndexer实例，传入required参数
    mockApiIndexer = new MockedApiIndexer(mockWorkerPool) as jest.Mocked<ApiIndexer>;
    searchProvider = new SearchProvider(mockApiIndexer);
  });

  describe('showQuickPick', () => {
    it('应该显示所有端点', async () => {
      const mockEndpoints = [
        (global as any).createMockApiEndpoint({
          method: 'GET',
          path: '/api/users',
          controllerClass: 'UserController',
          methodName: 'getUsers'
        }),
        (global as any).createMockApiEndpoint({
          method: 'POST',
          path: '/api/users',
          controllerClass: 'UserController',
          methodName: 'createUser'
        })
      ];

      mockApiIndexer.searchEndpoints.mockReturnValue(mockEndpoints);
      
      const showQuickPickSpy = jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(undefined);

      await searchProvider.showQuickPick();

      expect(showQuickPickSpy).toHaveBeenCalled();
      const items = showQuickPickSpy.mock.calls[0][0] as any[];
      expect(items).toHaveLength(2);
      expect(items[0].label).toContain('GET');
      expect(items[0].label).toContain('/api/users');
    });

    it('应该处理空结果', async () => {
      mockApiIndexer.searchEndpoints.mockReturnValue([]);
      
      const showQuickPickSpy = jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(undefined);

      await searchProvider.showQuickPick();

      expect(showQuickPickSpy).toHaveBeenCalled();
      const items = showQuickPickSpy.mock.calls[0][0] as any[];
      expect(items).toHaveLength(1);
      expect(items[0].label).toBe('未找到API端点');
    });
  });
}); 