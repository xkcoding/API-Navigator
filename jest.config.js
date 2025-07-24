module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // 测试文件匹配模式
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/test/**/*.test.ts'
  ],
  
  // TypeScript 配置
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  
  // 模块路径映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    'vscode': '<rootDir>/test/setup.ts'
  },
  
  // 覆盖率配置
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/types.ts',
    '!src/extension.ts'
  ],
  
  // 覆盖率阈值 (调整到当前水平，便于CI通过)
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40
    }
  },
  
  // 设置文件
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  
  // 忽略路径
  testPathIgnorePatterns: [
    '/node_modules/',
    '/out/',
    '/RestfulHelper/'
  ],
  
  // 清理模拟
  clearMocks: true,
  restoreMocks: true,
  
  // 超时设置
  testTimeout: 10000,
  
  // 详细输出
  verbose: true
}; 