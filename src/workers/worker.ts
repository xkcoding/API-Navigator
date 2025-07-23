import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import { JavaASTParser } from '../core/JavaASTParser';
import { WorkerMessage, ApiEndpoint } from '../core/types';

// 监听主线程发送的消息
parentPort?.on('message', async (message: WorkerMessage) => {
    try {
        await handleMessage(message);
    } catch (error) {
        // 发送错误消息回主线程
        parentPort?.postMessage({
            type: 'error',
            data: error instanceof Error ? error.message : String(error),
            id: message.id
        });
    }
});

/**
 * 处理主线程发送的消息
 */
async function handleMessage(message: WorkerMessage): Promise<void> {
    switch (message.type) {
        case 'parseFiles':
            await parseFiles(message.data, message.id);
            break;
        
        default:
            throw new Error(`未知的消息类型: ${message.type}`);
    }
}

/**
 * 解析文件列表
 */
async function parseFiles(filePaths: string[], taskId?: string): Promise<void> {
    const allEndpoints: ApiEndpoint[] = [];

    for (const filePath of filePaths) {
        try {
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                console.warn(`文件不存在: ${filePath}`);
                continue;
            }

            // 读取文件内容
            const content = fs.readFileSync(filePath, 'utf-8');
            
            // 跳过空文件
            if (!content.trim()) {
                continue;
            }

            // 解析 Java 文件
            const endpoints = await JavaASTParser.parseFile(filePath, content);
            allEndpoints.push(...endpoints);

        } catch (error) {
            console.error(`解析文件失败: ${filePath}`, error);
            // 继续处理其他文件，不中断整个批次
        }
    }

    // 发送结果回主线程
    parentPort?.postMessage({
        type: 'result',
        data: allEndpoints,
        id: taskId
    });
}

/**
 * 解析单个文件
 */
async function parseFile(filePath: string, taskId?: string): Promise<void> {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const endpoints = await JavaASTParser.parseFile(filePath, content);

        parentPort?.postMessage({
            type: 'result',
            data: endpoints,
            id: taskId
        });

    } catch (error) {
        throw error; // 重新抛出，让上层处理
    }
}

// 优雅关闭处理
process.on('SIGTERM', () => {
    console.log('Worker 接收到 SIGTERM 信号，正在关闭...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Worker 接收到 SIGINT 信号，正在关闭...');
    process.exit(0);
});

// 默认导出，防止模块加载错误
export {};   