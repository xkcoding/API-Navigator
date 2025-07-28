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
    public static async parseFile(filePath: string, content: string, fileModifiedTime?: number): Promise<ApiEndpoint[]> {
        try {
            const ast = parse(content);

            const endpoints: ApiEndpoint[] = [];
            const controllers = this.findControllerClasses(ast);

            for (const controller of controllers) {
                const controllerInfo = this.parseController(controller, filePath, fileModifiedTime);
                endpoints.push(...controllerInfo.methods);
            }

            return endpoints;
        } catch (error) {
            console.error(`解析 Java 文件失败: ${filePath}`, error);
            return [];
        }
    }

    /**
     * 查找所有控制器类 - 适配ANTLR Context结构
     */
    private static findControllerClasses(ast: any): ClassNode[] {
        const controllers: ClassNode[] = [];
        
        this.traverseAST(ast, (node) => {
            if (node.constructor.name === 'TypeDeclarationContext') {
                // 在TypeDeclarationContext中查找注解和类声明
                const annotations = this.extractClassAnnotations(node);
                const hasControllerAnnotation = annotations.some(ann => 
                    ann.name === 'RestController' || ann.name === 'Controller'
                );

                if (hasControllerAnnotation) {
                    // 查找嵌套的ClassDeclarationContext
                    const classDeclaration = this.findChildByType(node, 'ClassDeclarationContext');
                    if (classDeclaration) {
                        const className = this.extractClassName(classDeclaration);
                        const methods = this.extractMethodsFromClass(classDeclaration);
                        
                        controllers.push({
                            name: className,
                            annotations,
                            methods
                        });
                    }
                }
            }
        });

        return controllers;
    }

    /**
     * 在节点的直接子节点中查找指定类型
     */
    private static findChildByType(node: any, typeName: string): any {
        if (!node.children) return null;
        
        for (const child of node.children) {
            if (child && child.constructor.name === typeName) {
                return child;
            }
        }
        return null;
    }

    /**
     * 提取类名
     */
    private static extractClassName(classNode: any): string {
        // ClassDeclarationContext的第二个子节点通常是类名
        if (classNode.children && classNode.children.length >= 2) {
            const nameNode = classNode.children[1];
            if (nameNode.symbol && nameNode.symbol.text) {
                return nameNode.symbol.text;
            } else if (nameNode.text) {
                return nameNode.text;
            }
        }
        return 'UnknownController';
    }

    /**
     * 提取类级别注解
     */
    private static extractClassAnnotations(typeDeclarationNode: any): Annotation[] {
        const annotations: Annotation[] = [];
        
        if (!typeDeclarationNode.children) return annotations;
        
        // 遍历TypeDeclaration的子节点，查找ClassOrInterfaceModifierContext
        for (const child of typeDeclarationNode.children) {
            if (child.constructor.name === 'ClassOrInterfaceModifierContext') {
                const annotation = this.extractAnnotationFromModifier(child);
                if (annotation && this.SPRING_ANNOTATIONS.includes(annotation.name)) {
                    annotations.push(annotation);
                }
            }
        }
        
        return annotations;
    }

    /**
     * 从修饰符中提取注解
     */
    private static extractAnnotationFromModifier(modifierNode: any): Annotation | null {
        if (!modifierNode.children || modifierNode.children.length === 0) return null;
        
        const firstChild = modifierNode.children[0];
        if (firstChild.constructor.name === 'AnnotationContext') {
            return this.extractAnnotationFromContext(firstChild);
        }
        
        return null;
    }

    /**
     * 从AnnotationContext提取注解信息
     */
    private static extractAnnotationFromContext(annotationNode: any): Annotation | null {
        if (!annotationNode.children) return null;
        
        // AnnotationContext的第二个子节点通常是QualifiedNameContext
        if (annotationNode.children.length >= 2) {
            const nameNode = annotationNode.children[1];
            if (nameNode.constructor.name === 'QualifiedNameContext') {
                const name = this.getNodeText(nameNode);
                const attributes = this.extractAnnotationAttributes(annotationNode);
                return { name, attributes };
            }
        }
        
        return null;
    }

    /**
     * 统一获取节点文本的工具方法
     */
    private static getNodeText(node: any): string {
        if (!node) return '';
        
        // 尝试不同方法获取文本
        if (node.symbol && node.symbol.text) {
            return node.symbol.text;
        } else if (node.text) {
            return node.text;
        } else if (typeof node.getText === 'function') {
            return node.getText();
        } else if (node.toString) {
            return node.toString();
        }
        
        // 对于复合节点，递归获取所有子节点文本
        if (node.children && Array.isArray(node.children)) {
            return node.children.map((child: any) => this.getNodeText(child)).join('');
        }
        
        return '';
    }

    /**
     * 提取注解属性（支持复杂格式如@RequestMapping(value = "...", method = ...)）
     */
    private static extractAnnotationAttributes(annotationNode: any): Record<string, any> | undefined {
        const attributes: Record<string, any> = {};
        
        if (!annotationNode.children) return undefined;
        
        // 查找ElementValuePairsContext或ElementValueContext
        this.traverseAST(annotationNode, (node) => {
            if (node.constructor.name === 'ElementValuePairsContext') {
                // 处理多个属性: value = "...", method = ...
                this.parseElementValuePairs(node, attributes);
            } else if (node.constructor.name === 'ElementValueContext') {
                // 处理单个值: @RequestMapping("/api/users")
                const value = this.getNodeText(node);
                const cleanValue = value.replace(/['"]/g, '');
                if (cleanValue && !cleanValue.includes('RequestMethod')) {
                    attributes.value = cleanValue;
                }
            }
        });
        
        return Object.keys(attributes).length > 0 ? attributes : undefined;
    }

    /**
     * 解析注解的多个属性对
     */
    private static parseElementValuePairs(pairsNode: any, attributes: Record<string, any>): void {
        this.traverseAST(pairsNode, (node) => {
            if (node.constructor.name === 'ElementValuePairContext') {
                // 查找属性名和值
                let propertyName = '';
                let propertyValue = '';
                
                this.traverseAST(node, (subNode) => {
                    if (subNode.constructor.name === 'TerminalNode' && subNode.symbol) {
                        const text = subNode.symbol.text;
                        if (text === 'value' || text === 'method' || text === 'path') {
                            propertyName = text;
                        }
                    } else if (subNode.constructor.name === 'LiteralContext') {
                        const literal = this.getNodeText(subNode);
                        propertyValue = literal.replace(/['"]/g, '');
                    }
                });
                
                if (propertyName && propertyValue) {
                    if (propertyName === 'value' || propertyName === 'path') {
                        attributes.value = propertyValue;
                    } else if (propertyName === 'method' && propertyValue.includes('GET')) {
                        attributes.method = 'GET';
                    } else if (propertyName === 'method' && propertyValue.includes('POST')) {
                        attributes.method = 'POST';
                    } else if (propertyName === 'method' && propertyValue.includes('PUT')) {
                        attributes.method = 'PUT';
                    } else if (propertyName === 'method' && propertyValue.includes('DELETE')) {
                        attributes.method = 'DELETE';
                    }
                }
            }
        });
    }

    /**
     * 从类中提取方法
     */
    private static extractMethodsFromClass(classNode: any): MethodNode[] {
        const methods: MethodNode[] = [];
        
        this.traverseAST(classNode, (node) => {
            if (node.constructor.name === 'MethodDeclarationContext') {
                const method = this.extractMethodInfo(node);
                if (method && method.annotations.some(ann => this.MAPPING_ANNOTATIONS.includes(ann.name))) {
                    methods.push(method);
                }
            }
        });
        
        return methods;
    }

    /**
     * 提取AST节点的位置信息
     */
    private static extractNodeLocation(node: any): { startLine: number; endLine: number; startColumn: number; endColumn: number } {
        let startLine = 1;
        let endLine = 1;
        let startColumn = 0;
        let endColumn = 0;

        try {
            // 尝试从start token获取位置信息
            if (node.start) {
                startLine = node.start.line || 1;
                startColumn = node.start.column || 0;
            }
            
            // 尝试从stop token获取结束位置
            if (node.stop) {
                endLine = node.stop.line || startLine;
                endColumn = node.stop.column || startColumn;
            }
            
            // 如果没有stop信息，使用start信息
            if (endLine === 1 && startLine > 1) {
                endLine = startLine;
            }
            
            // 备用方法：尝试从symbol获取
            if (startLine === 1 && node.symbol) {
                startLine = node.symbol.line || 1;
                startColumn = node.symbol.column || 0;
                endLine = startLine;
                endColumn = startColumn;
            }
            
            // 最后的备用：遍历子节点寻找位置信息
            if (startLine === 1 && node.children && node.children.length > 0) {
                for (const child of node.children) {
                    const childLocation = this.extractNodeLocation(child);
                    if (childLocation.startLine > 1) {
                        startLine = childLocation.startLine;
                        startColumn = childLocation.startColumn;
                        endLine = childLocation.endLine;
                        endColumn = childLocation.endColumn;
                        break;
                    }
                }
            }
        } catch (error) {
            // 出错时使用默认值
            console.warn('提取节点位置信息时出错:', error);
        }

        return { startLine, endLine, startColumn, endColumn };
    }

    /**
     * 提取方法信息
     */
    private static extractMethodInfo(methodNode: any): MethodNode | null {
        const methodName = this.extractMethodName(methodNode);
        const annotations = this.extractMethodAnnotations(methodNode);
        const location = this.extractNodeLocation(methodNode);
        
        return {
            name: methodName,
            annotations,
            parameters: [], // TODO: 实现参数提取
            startLine: location.startLine,
            endLine: location.endLine,
            startColumn: location.startColumn,
            endColumn: location.endColumn
        };
    }



    /**
     * 提取方法注解 - 改进版本，在ClassBodyDeclarationContext中查找
     */
    private static extractMethodAnnotations(methodNode: any): Annotation[] {
        const annotations: Annotation[] = [];
        
        // 方法1: 尝试从_parent查找ClassBodyDeclarationContext
        let classBodyDecl = null;
        
        // 向上查找ClassBodyDeclarationContext
        let current = methodNode._parent;
        while (current && !classBodyDecl) {
            if (current.constructor.name === 'ClassBodyDeclarationContext') {
                classBodyDecl = current;
                break;
            }
            current = current._parent;
        }
        
        if (classBodyDecl && classBodyDecl.children) {
            // 查找ModifierContext
            for (const child of classBodyDecl.children) {
                if (child.constructor.name === 'ModifierContext') {
                    // 在ModifierContext中查找注解
                    this.traverseAST(child, (node) => {
                        if (node.constructor.name === 'AnnotationContext') {
                            const annotation = this.extractAnnotationFromContext(node);
                            if (annotation && this.SPRING_ANNOTATIONS.includes(annotation.name)) {
                                annotations.push(annotation);
                            }
                        }
                    });
                }
            }
        }
        
        return annotations;
    }

    /**
     * 提取方法名 - 兼容新版本java-ast
     */
    private static extractMethodName(methodNode: any): string {
        // 尝试多种方式提取方法名，适配不同版本的java-ast
        
        // 方式1: 直接访问name属性 (适配新版本)
        if (methodNode.name) {
            return methodNode.name;
        }
        
        // 方式2: 查找identifier节点
        if (methodNode.children) {
            for (const child of methodNode.children) {
                // 查找方法标识符节点
                if (child.constructor.name === 'IdentifierContext' || 
                    child.constructor.name === 'Identifier' ||
                    (child.symbol && child.symbol.type === 'IDENTIFIER')) {
                    const text = this.getNodeText(child);
                    if (text && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(text)) {
                        return text;
                    }
                }
                
                // 旧版本的TerminalNode方式 (向后兼容)
                if (child.constructor.name === 'TerminalNode') {
                    const text = this.getNodeText(child);
                    if (text && 
                        !['public', 'private', 'protected', 'static', 'void'].includes(text) &&
                        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(text)) {
                        return text;
                    }
                }
            }
        }
        
        // 方式3: 尝试从方法签名中解析 (最后的后备方案)
        const methodText = this.getNodeText(methodNode);
        if (methodText) {
            // 使用正则表达式提取方法名
            const methodMatch = methodText.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/);
            if (methodMatch) {
                const extractedName = methodMatch[0].replace(/\s*\($/, '');
                if (extractedName && 
                    !['public', 'private', 'protected', 'static', 'void', 'final', 'abstract'].includes(extractedName)) {
                    return extractedName;
                }
            }
        }
        
        console.warn('⚠️ 无法解析方法名，使用默认值. 方法节点:', methodNode?.constructor?.name);
        return 'unknownMethod';
    }

    /**
     * 解析控制器类，提取所有 API 端点
     */
    private static parseController(controller: ClassNode, filePath: string, fileModifiedTime?: number): ControllerInfo {
        const classLevelMapping = this.extractClassMapping(controller);
        const endpoints: ApiEndpoint[] = [];

        for (const method of controller.methods) {
            const endpoint = this.parseMethod(method, controller.name, classLevelMapping, filePath, fileModifiedTime);
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

        if (requestMappingAnnotation?.attributes?.value) {
            return this.cleanPath(requestMappingAnnotation.attributes.value);
        }

        return '';
    }

    /**
     * 解析单个方法，生成 API 端点
     */
    private static parseMethod(method: MethodNode, controllerClass: string, classLevelMapping: string, filePath: string, fileModifiedTime?: number): ApiEndpoint | null {
        const mappingAnnotation = method.annotations.find(ann => 
            this.MAPPING_ANNOTATIONS.includes(ann.name)
        );

        if (!mappingAnnotation) return null;

        const httpMethod = this.extractHttpMethod(mappingAnnotation);
        const methodMapping = this.extractMethodMapping(mappingAnnotation);
        const fullPath = this.composeUrl(classLevelMapping, methodMapping);

        return {
            id: `${controllerClass}-${method.name}-${Date.now()}`,
            method: httpMethod,
            path: fullPath,
            classMapping: classLevelMapping,
            methodMapping,
            controllerClass,
            methodName: method.name,
            parameters: method.parameters,
            location: {
                filePath,
                startLine: method.startLine,
                endLine: method.endLine,
                startColumn: method.startColumn || 0,
                endColumn: method.endColumn || 0
            },
            annotations: method.annotations,
            pathComposition: {
                classPath: classLevelMapping,
                methodPath: methodMapping,
                fullPath,
                hasClassMapping: !!classLevelMapping,
                hasMethodMapping: !!methodMapping
            },
            fileModifiedTime
        };
    }

    /**
     * 提取方法级别的路径映射
     */
    private static extractMethodMapping(annotation: Annotation): string {
        if (annotation.attributes?.value) {
            return this.cleanPath(annotation.attributes.value);
        }
        return '';
    }

    /**
     * 提取 HTTP 方法
     */
    private static extractHttpMethod(annotation: Annotation): HttpMethod {
        switch (annotation.name) {
            case 'GetMapping':
                return 'GET';
            case 'PostMapping':
                return 'POST';
            case 'PutMapping':
                return 'PUT';
            case 'DeleteMapping':
                return 'DELETE';
            case 'PatchMapping':
                return 'PATCH';
            case 'RequestMapping':
                // TODO: 处理method属性
                return 'GET'; // 默认值
            default:
                return 'GET';
        }
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
     * 遍历 AST 节点 - 适配ANTLR Context结构
     */
    private static traverseAST(node: any, visitor: (node: any) => void): void {
        if (!node || typeof node !== 'object') return;

        visitor(node);

        if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
                this.traverseAST(child, visitor);
            }
        }
    }
} 