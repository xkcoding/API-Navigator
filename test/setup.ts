// 全局测试设置文件

// Mock VSCode API
const mockVscode = {
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/mock/workspace' },
        name: 'test-workspace'
      }
    ],
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn(),
      update: jest.fn()
    }),
    onDidChangeConfiguration: jest.fn(),
    findFiles: jest.fn().mockResolvedValue([]),
    createFileSystemWatcher: jest.fn().mockReturnValue({
      onDidCreate: jest.fn(),
      onDidChange: jest.fn(),
      onDidDelete: jest.fn(),
      dispose: jest.fn()
    })
  },
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showQuickPick: jest.fn(),
    createTreeView: jest.fn(),
    registerTreeDataProvider: jest.fn(),
    setStatusBarMessage: jest.fn()
  },
  commands: {
    registerCommand: jest.fn()
  },
  Uri: {
    file: jest.fn((path: string) => ({ fsPath: path })),
    parse: jest.fn()
  },
  FileSystemWatcher: jest.fn(),
  RelativePattern: jest.fn(),
  TreeItem: jest.fn(),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },
  ThemeIcon: jest.fn(),
  EventEmitter: jest.fn().mockImplementation(() => ({
    fire: jest.fn(),
    event: jest.fn(),
    dispose: jest.fn()
  })),
  Disposable: {
    from: jest.fn()
  }
};

// 设置全局 vscode 模块模拟
Object.defineProperty(global, 'vscode', {
  value: mockVscode,
  writable: true
});

// 模拟 fs 模块
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn()
  },
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  statSync: jest.fn()
}));

// 注意：java-ast 库不需要Mock，让它使用真实的解析功能
// 这样JavaASTParser就能正常工作了

// 全局测试工具函数
(global as any).createMockApiEndpoint = (overrides = {}) => ({
  id: 'test-endpoint',
  method: 'GET',
  path: '/api/test',
  classMapping: '/api',
  methodMapping: '/test',
  controllerClass: 'TestController',
  methodName: 'testMethod',
  parameters: [],
  location: {
    filePath: '/mock/TestController.java',
    startLine: 10,
    endLine: 15,
    startColumn: 5,
    endColumn: 10
  },
  annotations: [],
  pathComposition: {
    classPath: '/api',
    methodPath: '/test',
    fullPath: '/api/test',
    hasClassMapping: true,
    hasMethodMapping: true
  },
  ...overrides
});

// 清理函数
afterEach(() => {
  jest.clearAllMocks();
});

// 导出mockVscode供Jest模块映射使用
module.exports = mockVscode;