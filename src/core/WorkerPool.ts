import { Worker } from 'worker_threads';
import * as path from 'path';
import { WorkerMessage, ApiEndpoint } from './types';

export class WorkerPool {
    private workers: Worker[] = [];
    private availableWorkers: Worker[] = [];
    private taskQueue: Array<{
        resolve: (value: any) => void;
        reject: (error: any) => void;
        type: string;
        data: any;
    }> = [];

    constructor(private poolSize: number = 4) {
        this.initializeWorkers();
    }

    /**
     * 初始化工作线程池
     */
    private initializeWorkers(): void {
        // 修复路径解析问题：根据当前运行环境确定正确的worker.js路径
        let workerScript: string;
        
        // 检查是否在out目录中运行（生产环境）
        if (__dirname.includes('out')) {
            // 在编译后的out目录中运行
            workerScript = path.join(__dirname, '../workers/worker.js');
        } else {
            // 在src目录中运行（开发/测试环境），需要指向编译后的文件
            const rootDir = path.resolve(__dirname, '../../');
            workerScript = path.join(rootDir, 'out/workers/worker.js');
        }
        
        console.log(`使用工作线程脚本: ${workerScript}`);
        
        for (let i = 0; i < this.poolSize; i++) {
            try {
                const worker = new Worker(workerScript);
                this.setupWorkerListeners(worker);
                this.workers.push(worker);
                this.availableWorkers.push(worker);
            } catch (error) {
                console.error('创建工作线程失败:', error);
            }
        }
    }

    /**
     * 设置工作线程事件监听器
     */
    private setupWorkerListeners(worker: Worker): void {
        worker.on('message', (message: WorkerMessage) => {
            // 工作线程完成任务，重新加入可用池
            this.availableWorkers.push(worker);
            this.processQueue();
        });

        worker.on('error', (error) => {
            console.error('工作线程错误:', error);
            // 重新创建工作线程
            this.replaceWorker(worker);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`工作线程异常退出，代码: ${code}`);
                this.replaceWorker(worker);
            }
        });
    }

    /**
     * 替换异常的工作线程
     */
    private replaceWorker(oldWorker: Worker): void {
        // 从池中移除旧的工作线程
        const workerIndex = this.workers.indexOf(oldWorker);
        if (workerIndex > -1) {
            this.workers.splice(workerIndex, 1);
        }

        const availableIndex = this.availableWorkers.indexOf(oldWorker);
        if (availableIndex > -1) {
            this.availableWorkers.splice(availableIndex, 1);
        }

        try {
            // 创建新的工作线程，使用相同的路径解析逻辑
            let workerScript: string;
            
            if (__dirname.includes('out')) {
                workerScript = path.join(__dirname, '../workers/worker.js');
            } else {
                const rootDir = path.resolve(__dirname, '../../');
                workerScript = path.join(rootDir, 'out/workers/worker.js');
            }
            
            const newWorker = new Worker(workerScript);
            this.setupWorkerListeners(newWorker);
            this.workers.push(newWorker);
            this.availableWorkers.push(newWorker);
            
            console.log('工作线程替换成功');
        } catch (error) {
            console.error('替换工作线程失败:', error);
        }

        // 终止旧的工作线程
        oldWorker.terminate();
    }

    /**
     * 执行任务
     */
    public async execute(type: string, data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.taskQueue.push({ resolve, reject, type, data });
            this.processQueue();
        });
    }

    /**
     * 处理任务队列
     */
    private processQueue(): void {
        if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
            return;
        }

        const task = this.taskQueue.shift()!;
        const worker = this.availableWorkers.shift()!;

        // 为任务分配唯一 ID
        const taskId = `task_${Date.now()}_${Math.random()}`;
        
        // 设置一次性监听器处理这个任务的结果
        const messageHandler = (message: WorkerMessage) => {
            if (message.id === taskId) {
                worker.off('message', messageHandler);
                
                if (message.type === 'result') {
                    task.resolve(message.data);
                } else if (message.type === 'error') {
                    task.reject(new Error(message.data));
                }
                
                // 工作线程完成任务，重新加入可用池
                this.availableWorkers.push(worker);
                this.processQueue();
            }
        };

        worker.on('message', messageHandler);

        // 发送任务到工作线程
        worker.postMessage({
            type: task.type,
            data: task.data,
            id: taskId
        });
    }

    /**
     * 批量解析文件
     */
    public async batchParseFiles(filePaths: string[]): Promise<ApiEndpoint[]> {
        const chunkSize = Math.ceil(filePaths.length / this.poolSize);
        const chunks: string[][] = [];

        // 将文件分块
        for (let i = 0; i < filePaths.length; i += chunkSize) {
            chunks.push(filePaths.slice(i, i + chunkSize));
        }

        // 并行处理每个块
        const promises = chunks.map(chunk => 
            this.execute('parseFiles', chunk)
        );

        try {
            const results = await Promise.all(promises);
            // 合并所有结果
            return results.flat();
        } catch (error) {
            console.error('批量解析文件失败:', error);
            return [];
        }
    }

    /**
     * 销毁工作线程池
     */
    public async destroy(): Promise<void> {
        const terminatePromises = this.workers.map(worker => 
            worker.terminate()
        );

        await Promise.all(terminatePromises);
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
    }

    /**
     * 获取池状态信息
     */
    public getStatus(): {
        totalWorkers: number;
        availableWorkers: number;
        queuedTasks: number;
    } {
        return {
            totalWorkers: this.workers.length,
            availableWorkers: this.availableWorkers.length,
            queuedTasks: this.taskQueue.length
        };
    }
} 