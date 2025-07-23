export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiEndpoint {
    id: string;
    method: HttpMethod;
    path: string;
    classMapping: string;
    methodMapping: string;
    controllerClass: string;
    methodName: string;
    parameters: Parameter[];
    location: CodeLocation;
    annotations: Annotation[];
    pathComposition: PathComposition;
}

export interface CodeLocation {
    filePath: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
}

export interface Parameter {
    name: string;
    type: string;
    isPathVariable: boolean;
    isRequestParam: boolean;
    isRequestBody: boolean;
}

export interface Annotation {
    name: string;
    attributes?: Record<string, any>;
}

export interface PathComposition {
    classPath: string;
    methodPath: string;
    fullPath: string;
    hasClassMapping: boolean;
    hasMethodMapping: boolean;
}

export interface ControllerInfo {
    className: string;
    classLevelMapping: string;
    methods: ApiEndpoint[];
}

export interface WorkerMessage {
    type: 'parseFiles' | 'result' | 'error';
    data: any;
    id?: string;
}

export interface JavaAST {
    [key: string]: any;
}

export interface ClassNode {
    name: string;
    annotations: Annotation[];
    methods: MethodNode[];
}

export interface MethodNode {
    name: string;
    annotations: Annotation[];
    parameters: Parameter[];
    startLine: number;
    endLine: number;
} 