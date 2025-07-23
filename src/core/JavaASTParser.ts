import { parse } from 'java-ast';
import { 
    ApiEndpoint, 
    ControllerInfo, 
    ClassNode, 
    MethodNode, 
    Annotation, 
    HttpMethod, 
    CodeLocation,
    PathComposition 
} from './types';

export class JavaASTParser {
    private static readonly SPRING_ANNOTATIONS = [
        'RestController', 'Controller', 'RequestMapping',
        'GetMapping', 'PostMapping', 'PutMapping', 
        'DeleteMapping', 'PatchMapping'
    ];

    private static readonly MAPPING_ANNOTATIONS = [
        'GetMapping', 'PostMapping', 'PutMapping',
        'DeleteMapping', 'PatchMapping', 'RequestMapping'
    ];

    /**
     * 解析 Java 文件并提取 API 端点
     */
    public static async parseFile(filePath: string, content: string): Promise<ApiEndpoint[]> {
        try {
            const ast = parse(content);

            const endpoints: ApiEndpoint[] = [];
            const controllers = this.findControllerClasses(ast);

            for (const controller of controllers) {
                const controllerInfo = this.parseController(controller, filePath);
                endpoints.push(...controllerInfo.methods);
            }

            return endpoints;
        } catch (error) {
            console.error(`解析 Java 文件失败: ${filePath}`, error);
            return [];
        }
    }

    /**
     * 查找所有控制器类
     */
    private static findControllerClasses(ast: any): ClassNode[] {
        const controllers: ClassNode[] = [];
        
        // 遍历 AST 查找带有 @RestController 或 @Controller 注解的类
        this.traverseAST(ast, (node) => {
            if (node.type === 'ClassDeclaration') {
                const annotations = this.extractAnnotations(node);
                const hasControllerAnnotation = annotations.some(ann => 
                    ann.name === 'RestController' || ann.name === 'Controller'
                );

                if (hasControllerAnnotation) {
                    controllers.push({
                        name: node.name?.name || 'UnknownController',
                        annotations,
                        methods: this.extractMethods(node)
                    });
                }
            }
        });

        return controllers;
    }

    /**
     * 解析控制器类，提取所有 API 端点
     */
    private static parseController(controller: ClassNode, filePath: string): ControllerInfo {
        const classLevelMapping = this.extractClassMapping(controller);
        const endpoints: ApiEndpoint[] = [];

        for (const method of controller.methods) {
            const endpoint = this.parseMethod(method, controller.name, classLevelMapping, filePath);
            if (endpoint) {
                endpoints.push(endpoint);
            }
        }

        return {
            className: controller.name,
            classLevelMapping,
            methods: endpoints
        };
    }

    /**
     * 提取类级别的 @RequestMapping
     */
    private static extractClassMapping(controller: ClassNode): string {
        const requestMappingAnnotation = controller.annotations.find(
            ann => ann.name === 'RequestMapping'
        );

        if (requestMappingAnnotation) {
            return this.extractMappingValue(requestMappingAnnotation) || '';
        }

        return '';
    }

    /**
     * 解析方法，提取 API 端点信息
     */
    private static parseMethod(
        method: MethodNode, 
        className: string, 
        classMapping: string, 
        filePath: string
    ): ApiEndpoint | null {
        const mappingAnnotation = this.findMappingAnnotation(method);
        if (!mappingAnnotation) {
            return null;
        }

        const methodMapping = this.extractMappingValue(mappingAnnotation) || '';
        const httpMethod = this.extractHttpMethod(mappingAnnotation);
        const fullPath = this.composeUrl(classMapping, methodMapping);

        const pathComposition: PathComposition = {
            classPath: classMapping,
            methodPath: methodMapping,
            fullPath,
            hasClassMapping: !!classMapping,
            hasMethodMapping: !!methodMapping
        };

        return {
            id: `${className}_${method.name}_${Date.now()}`,
            method: httpMethod,
            path: fullPath,
            classMapping,
            methodMapping,
            controllerClass: className,
            methodName: method.name,
            parameters: method.parameters,
            location: {
                filePath,
                startLine: method.startLine,
                endLine: method.endLine,
                startColumn: 0,
                endColumn: 0
            },
            annotations: method.annotations,
            pathComposition
        };
    }

    /**
     * 查找方法上的映射注解
     */
    private static findMappingAnnotation(method: MethodNode): Annotation | null {
        return method.annotations.find(ann => 
            this.MAPPING_ANNOTATIONS.includes(ann.name)
        ) || null;
    }

    /**
     * 提取注解的映射值 (value 或 path 属性)
     */
    private static extractMappingValue(annotation: Annotation): string | null {
        if (!annotation.attributes) {
            return null;
        }

        // 优先查找 value 属性，然后是 path 属性
        const value = annotation.attributes.value || annotation.attributes.path;
        if (typeof value === 'string') {
            return value.replace(/['"]/g, ''); // 去除引号
        }

        if (Array.isArray(value) && value.length > 0) {
            return String(value[0]).replace(/['"]/g, '');
        }

        return null;
    }

    /**
     * 提取 HTTP 方法
     */
    private static extractHttpMethod(annotation: Annotation): HttpMethod {
        switch (annotation.name) {
            case 'GetMapping': return 'GET';
            case 'PostMapping': return 'POST';
            case 'PutMapping': return 'PUT';
            case 'DeleteMapping': return 'DELETE';
            case 'PatchMapping': return 'PATCH';
            case 'RequestMapping':
                // 从 method 属性中提取
                const methodValue = annotation.attributes?.method;
                if (methodValue) {
                    return this.parseRequestMethod(methodValue);
                }
                return 'GET'; // 默认值
            default:
                return 'GET';
        }
    }

    /**
     * 解析 RequestMethod 枚举值
     */
    private static parseRequestMethod(methodValue: string): HttpMethod {
        // 处理 RequestMethod.GET 格式
        if (methodValue.includes('RequestMethod.')) {
            const method = methodValue.split('.')[1];
            return method.toUpperCase() as HttpMethod;
        }
        return methodValue.toUpperCase() as HttpMethod;
    }

    /**
     * 组合完整的 URL 路径
     */
    private static composeUrl(classMapping: string, methodMapping: string): string {
        const cleanClassPath = this.cleanPath(classMapping);
        const cleanMethodPath = this.cleanPath(methodMapping);

        if (!cleanClassPath) return cleanMethodPath || '/';
        if (!cleanMethodPath) return cleanClassPath;

        // 避免重复的斜杠
        const basePath = cleanClassPath.endsWith('/') 
            ? cleanClassPath.slice(0, -1) 
            : cleanClassPath;
        const methodPath = cleanMethodPath.startsWith('/') 
            ? cleanMethodPath 
            : '/' + cleanMethodPath;

        return basePath + methodPath;
    }

    /**
     * 清理路径字符串
     */
    private static cleanPath(path: string): string {
        if (!path) return '';
        // 去除引号，处理变量替换
        return path.replace(/['"]/g, '').replace(/\$\{([^}]+)\}/g, '{$1}');
    }

    /**
     * 提取注解信息
     */
    private static extractAnnotations(node: any): Annotation[] {
        if (!node.modifiers) return [];

        const annotations: Annotation[] = [];
        for (const modifier of node.modifiers) {
            if (modifier.type === 'Annotation') {
                const name = this.extractAnnotationName(modifier);
                if (this.SPRING_ANNOTATIONS.includes(name)) {
                    annotations.push({
                        name,
                        attributes: this.extractAnnotationAttributes(modifier)
                    });
                }
            }
        }
        return annotations;
    }

    /**
     * 提取注解名称
     */
    private static extractAnnotationName(annotation: any): string {
        if (annotation.typeName?.name) {
            return annotation.typeName.name;
        }
        return '';
    }

    /**
     * 提取注解属性
     */
    private static extractAnnotationAttributes(annotation: any): Record<string, any> | undefined {
        // 这里需要根据 java-ast 的具体结构来实现
        // 暂时返回空对象
        return {};
    }

    /**
     * 提取方法信息
     */
    private static extractMethods(classNode: any): MethodNode[] {
        const methods: MethodNode[] = [];
        
        if (classNode.bodyDeclarations) {
            for (const member of classNode.bodyDeclarations) {
                if (member.type === 'MethodDeclaration') {
                    const annotations = this.extractAnnotations(member);
                    if (annotations.some(ann => this.MAPPING_ANNOTATIONS.includes(ann.name))) {
                        methods.push({
                            name: member.name?.name || 'unknownMethod',
                            annotations,
                            parameters: [], // TODO: 提取参数信息
                            startLine: member.range?.[0] || 0,
                            endLine: member.range?.[1] || 0
                        });
                    }
                }
            }
        }

        return methods;
    }

    /**
     * 遍历 AST 节点
     */
    private static traverseAST(node: any, visitor: (node: any) => void): void {
        if (!node || typeof node !== 'object') return;

        visitor(node);

        for (const key in node) {
            const child = node[key];
            if (Array.isArray(child)) {
                for (const item of child) {
                    this.traverseAST(item, visitor);
                }
            } else if (typeof child === 'object') {
                this.traverseAST(child, visitor);
            }
        }
    }
} 