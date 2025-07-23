import { JavaASTParser } from '../../src/core/JavaASTParser';
import { parse } from 'java-ast';

// Mock java-ast
jest.mock('java-ast');
const mockParse = parse as jest.MockedFunction<typeof parse>;

describe('JavaASTParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseFile', () => {
    it('应该能解析简单的 RestController', async () => {
      // 使用 any 类型避免严格的类型检查
      mockParse.mockReturnValue({} as any);
      
      // 模拟 JavaASTParser 的内部方法
      const originalFindControllerClasses = (JavaASTParser as any).findControllerClasses;
      const originalParseController = (JavaASTParser as any).parseController;
      
      (JavaASTParser as any).findControllerClasses = jest.fn().mockReturnValue([
        {
          name: 'UserController',
          annotations: [
            { name: 'RestController' },
            { name: 'RequestMapping', attributes: { value: '/api/users' } }
          ],
          methods: [
            {
              name: 'getUser',
              annotations: [
                { name: 'GetMapping', attributes: { value: '/{id}' } }
              ],
              parameters: [],
              startLine: 10,
              endLine: 15
            }
          ]
        }
      ]);

      (JavaASTParser as any).parseController = jest.fn().mockReturnValue({
        className: 'UserController',
        classLevelMapping: '/api/users',
        methods: [
          {
            id: 'test-1',
            method: 'GET',
            path: '/api/users/{id}',
            classMapping: '/api/users',
            methodMapping: '/{id}',
            controllerClass: 'UserController',
            methodName: 'getUser',
            parameters: [],
            location: {
              filePath: '/mock/UserController.java',
              startLine: 10,
              endLine: 15,
              startColumn: 0,
              endColumn: 0
            },
            annotations: [],
            pathComposition: {
              classPath: '/api/users',
              methodPath: '/{id}',
              fullPath: '/api/users/{id}',
              hasClassMapping: true,
              hasMethodMapping: true
            }
          }
        ]
      });

      const result = await JavaASTParser.parseFile('/mock/UserController.java', 'mock content');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        method: 'GET',
        path: '/api/users/{id}',
        controllerClass: 'UserController',
        methodName: 'getUser'
      });

      // 恢复原始方法
      (JavaASTParser as any).findControllerClasses = originalFindControllerClasses;
      (JavaASTParser as any).parseController = originalParseController;
    });

    it('应该处理解析错误并返回空数组', async () => {
      mockParse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = await JavaASTParser.parseFile('/mock/invalid.java', 'invalid content');

      expect(result).toEqual([]);
    });

    it('应该处理空的 AST 并返回空数组', async () => {
      mockParse.mockReturnValue(null as any);

      const result = await JavaASTParser.parseFile('/mock/empty.java', '');

      expect(result).toEqual([]);
    });

    it('应该正确处理多个控制器', async () => {
      mockParse.mockReturnValue({} as any);
      
      const originalFindControllerClasses = (JavaASTParser as any).findControllerClasses;
      const originalParseController = (JavaASTParser as any).parseController;
      
      (JavaASTParser as any).findControllerClasses = jest.fn().mockReturnValue([
        { name: 'UserController' },
        { name: 'ProductController' }
      ]);

      (JavaASTParser as any).parseController = jest.fn()
        .mockReturnValueOnce({
          methods: [
            createMockEndpoint('GET', '/api/users', 'UserController', 'getUsers')
          ]
        })
        .mockReturnValueOnce({
          methods: [
            createMockEndpoint('POST', '/api/products', 'ProductController', 'createProduct')
          ]
        });

      const result = await JavaASTParser.parseFile('/mock/Controllers.java', 'mock content');

      expect(result).toHaveLength(2);
      expect(result[0].controllerClass).toBe('UserController');
      expect(result[1].controllerClass).toBe('ProductController');

      // 恢复原始方法
      (JavaASTParser as any).findControllerClasses = originalFindControllerClasses;
      (JavaASTParser as any).parseController = originalParseController;
    });
  });

  describe('静态方法测试', () => {
    it('应该识别 Spring 控制器注解', () => {
      const springAnnotations = (JavaASTParser as any).SPRING_ANNOTATIONS;
      
      expect(springAnnotations).toContain('RestController');
      expect(springAnnotations).toContain('Controller');
      expect(springAnnotations).toContain('RequestMapping');
      expect(springAnnotations).toContain('GetMapping');
      expect(springAnnotations).toContain('PostMapping');
      expect(springAnnotations).toContain('PutMapping');
      expect(springAnnotations).toContain('DeleteMapping');
    });

    it('应该识别映射注解', () => {
      const mappingAnnotations = (JavaASTParser as any).MAPPING_ANNOTATIONS;
      
      expect(mappingAnnotations).toContain('GetMapping');
      expect(mappingAnnotations).toContain('PostMapping');
      expect(mappingAnnotations).toContain('PutMapping');
      expect(mappingAnnotations).toContain('DeleteMapping');
      expect(mappingAnnotations).toContain('RequestMapping');
    });
  });
});

// 测试工具函数
function createMockEndpoint(
  method: string, 
  path: string, 
  controllerClass: string, 
  methodName: string
) {
  return {
    id: `${controllerClass}-${methodName}`,
    method,
    path,
    classMapping: '',
    methodMapping: path,
    controllerClass,
    methodName,
    parameters: [],
    location: {
      filePath: `/mock/${controllerClass}.java`,
      startLine: 1,
      endLine: 10,
      startColumn: 0,
      endColumn: 0
    },
    annotations: [],
    pathComposition: {
      classPath: '',
      methodPath: path,
      fullPath: path,
      hasClassMapping: false,
      hasMethodMapping: true
    }
  };
} 