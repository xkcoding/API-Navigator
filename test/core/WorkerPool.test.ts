import { WorkerPool } from '../../src/core/WorkerPool';
import { Worker } from 'worker_threads';

// Mock worker_threads
jest.mock('worker_threads', () => ({
  Worker: jest.fn()
}));

const MockedWorker = Worker as jest.MockedClass<typeof Worker>;

describe('WorkerPool', () => {
  let workerPool: WorkerPool;
  let mockWorkers: any[];

  beforeEach(() => {
    mockWorkers = [];
    
    // Mock Worker 构造函数
    MockedWorker.mockImplementation(() => {
      const mockWorker = {
        on: jest.fn(),
        postMessage: jest.fn(),
        terminate: jest.fn()
      };
      mockWorkers.push(mockWorker);
      return mockWorker as any;
    });
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (workerPool) {
      await workerPool.destroy();
    }
  });

  describe('constructor', () => {
    it('应该创建指定数量的工作线程', () => {
      workerPool = new WorkerPool(3);

      expect(MockedWorker).toHaveBeenCalledTimes(3);
      expect(mockWorkers).toHaveLength(3);
    });

    it('应该使用默认的线程池大小', () => {
      workerPool = new WorkerPool();

      expect(MockedWorker).toHaveBeenCalledTimes(4); // 默认大小为 4
    });

    it('应该为每个工作线程设置事件监听器', () => {
      workerPool = new WorkerPool(2);

      mockWorkers.forEach(worker => {
        expect(worker.on).toHaveBeenCalledWith('message', expect.any(Function));
        expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
      });
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      workerPool = new WorkerPool(2);
    });

    it('应该执行任务并返回结果', async () => {
      const mockResult = [{ id: 'test', method: 'GET', path: '/test' }];
      
      // 模拟工作线程响应
      const executePromise = workerPool.execute('parseFiles', ['test.java']);
      
      // 获取第一个工作线程的消息监听器
      const messageListener = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      // 模拟工作线程返回结果
      messageListener?.({
        type: 'result',
        data: mockResult
      });

      const result = await executePromise;
      expect(result).toEqual(mockResult);
    });

    it('应该处理工作线程错误', async () => {
      const executePromise = workerPool.execute('parseFiles', ['test.java']);
      
      const messageListener = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      // 模拟工作线程返回错误
      messageListener?.({
        type: 'error',
        data: 'Parse error'
      });

      await expect(executePromise).rejects.toBe('Parse error');
    });

    it('应该能够并发执行多个任务', async () => {
      const mockResult1 = [{ id: 'test1' }];
      const mockResult2 = [{ id: 'test2' }];

      const promise1 = workerPool.execute('parseFiles', ['test1.java']);
      const promise2 = workerPool.execute('parseFiles', ['test2.java']);

      // 模拟两个工作线程的响应
      const messageListener1 = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];
      const messageListener2 = mockWorkers[1].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      messageListener1?.({ type: 'result', data: mockResult1 });
      messageListener2?.({ type: 'result', data: mockResult2 });

      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      expect(result1).toEqual(mockResult1);
      expect(result2).toEqual(mockResult2);
    });

    it('应该排队任务当所有工作线程都忙时', async () => {
      // 创建只有一个工作线程的池
      await workerPool.destroy();
      workerPool = new WorkerPool(1);

      const promise1 = workerPool.execute('parseFiles', ['test1.java']);
      const promise2 = workerPool.execute('parseFiles', ['test2.java']);

      // 第一个任务应该立即开始
      expect(mockWorkers[0].postMessage).toHaveBeenCalledTimes(1);

      // 完成第一个任务
      const messageListener = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      messageListener?.({ type: 'result', data: [{ id: 'test1' }] });
      await promise1;

      // 第二个任务现在应该开始
      expect(mockWorkers[0].postMessage).toHaveBeenCalledTimes(2);

      messageListener?.({ type: 'result', data: [{ id: 'test2' }] });
      await promise2;
    });

    it('应该正确传递任务数据到工作线程', () => {
      const taskType = 'parseFiles';
      const taskData = ['file1.java', 'file2.java'];

      workerPool.execute(taskType, taskData);

      expect(mockWorkers[0].postMessage).toHaveBeenCalledWith({
        type: taskType,
        data: taskData,
        id: expect.any(String)
      });
    });
  });

  describe('工作线程错误处理', () => {
    beforeEach(() => {
      workerPool = new WorkerPool(2);
    });

    it('应该处理工作线程崩溃', () => {
      const errorListener = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      // 模拟工作线程错误
      errorListener?.(new Error('Worker crashed'));

      // 验证错误被记录（这里只是确保不会抛出异常）
      expect(console.error).toHaveBeenCalled?.();
    });

    it('应该替换崩溃的工作线程', () => {
      const initialWorkerCount = MockedWorker.mock.calls.length;

      const errorListener = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      // 模拟工作线程错误
      errorListener?.(new Error('Worker crashed'));

      // 应该创建新的工作线程来替换崩溃的
      expect(MockedWorker.mock.calls.length).toBeGreaterThan(initialWorkerCount);
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      workerPool = new WorkerPool(3);
    });

    it('应该终止所有工作线程', async () => {
      await workerPool.destroy();

      mockWorkers.forEach(worker => {
        expect(worker.terminate).toHaveBeenCalled();
      });
    });

    it('应该清理任务队列', async () => {
      // 添加一些排队的任务
      workerPool.execute('parseFiles', ['test1.java']);
      workerPool.execute('parseFiles', ['test2.java']);
      workerPool.execute('parseFiles', ['test3.java']);
      workerPool.execute('parseFiles', ['test4.java']); // 这个会排队

      await workerPool.destroy();

      // 验证所有工作线程都被终止
      mockWorkers.forEach(worker => {
        expect(worker.terminate).toHaveBeenCalled();
      });
    });

    it('应该拒绝排队中的任务', async () => {
      // 创建只有一个工作线程的池来测试排队
      await workerPool.destroy();
      workerPool = new WorkerPool(1);

      const promise1 = workerPool.execute('parseFiles', ['test1.java']);
      const promise2 = workerPool.execute('parseFiles', ['test2.java']); // 这个会排队

      await workerPool.destroy();

      // 排队的任务应该被拒绝
      await expect(promise2).rejects.toMatch(/disposed|terminated/i);
    });
  });

  describe('性能和压力测试', () => {
    beforeEach(() => {
      workerPool = new WorkerPool(4);
    });

    it('应该能处理大量并发任务', async () => {
      const taskCount = 100;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < taskCount; i++) {
        promises.push(workerPool.execute('parseFiles', [`test${i}.java`]));
      }

      // 模拟所有任务完成
      mockWorkers.forEach((worker, workerIndex) => {
        const messageListener = worker.on.mock.calls.find(
          (call: any[]) => call[0] === 'message'
        )?.[1];

        // 每个工作线程处理一部分任务
        let taskIndex = workerIndex;
        const interval = setInterval(() => {
          if (taskIndex < taskCount) {
            messageListener?.({
              type: 'result',
              data: [{ id: `result${taskIndex}` }]
            });
            taskIndex += 4; // 4个工作线程
          } else {
            clearInterval(interval);
          }
        }, 1);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(taskCount);
    });
  });
}); 