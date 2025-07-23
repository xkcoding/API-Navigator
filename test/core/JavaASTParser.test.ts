import { JavaASTParser } from '../../src/core/JavaASTParser';

describe('JavaASTParser', () => {
  describe('parseFile', () => {
    it('应该能解析简单的 RestController', async () => {
      const javaCode = `
package com.example.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {
    
    @GetMapping("/{id}")
    public User getUser(@PathVariable Long id) {
        return userService.findById(id);
    }
    
    @PostMapping
    public User createUser(@RequestBody User user) {
        return userService.save(user);
    }
}`;

      const result = await JavaASTParser.parseFile('/test/UserController.java', javaCode);

      // 验证解析结果
      expect(result.length).toBeGreaterThan(0);
      
      const getEndpoint = result.find(e => e.method === 'GET');
      if (getEndpoint) {
        expect(getEndpoint.path).toContain('/api/users');
        expect(getEndpoint.path).toContain('/{id}');
        expect(getEndpoint.controllerClass).toBe('UserController');
        expect(getEndpoint.methodName).toBe('getUser');
      }

      const postEndpoint = result.find(e => e.method === 'POST');
      if (postEndpoint) {
        expect(postEndpoint.path).toBe('/api/users');
        expect(postEndpoint.controllerClass).toBe('UserController');
        expect(postEndpoint.methodName).toBe('createUser');
      }
    });

    it('应该处理解析错误并返回空数组', async () => {
      const invalidJavaCode = 'this is not valid java code {{{';

      const result = await JavaASTParser.parseFile('/test/invalid.java', invalidJavaCode);

      expect(result).toEqual([]);
    });

    it('应该处理空内容并返回空数组', async () => {
      const result = await JavaASTParser.parseFile('/test/empty.java', '');

      expect(result).toEqual([]);
    });

    it('应该解析不同HTTP方法的映射', async () => {
      const javaCode = `
package com.example.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/products")
public class ProductController {
    
    @GetMapping
    public List<Product> getAllProducts() {
        return productService.findAll();
    }
    
    @PostMapping
    public Product createProduct(@RequestBody Product product) {
        return productService.save(product);
    }
    
    @PutMapping("/{id}")
    public Product updateProduct(@PathVariable Long id, @RequestBody Product product) {
        return productService.update(id, product);
    }
    
    @DeleteMapping("/{id}")
    public void deleteProduct(@PathVariable Long id) {
        productService.delete(id);
    }
}`;

      const result = await JavaASTParser.parseFile('/test/ProductController.java', javaCode);

      expect(result.length).toBe(4);
      
      const methods = result.map(e => e.method);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('DELETE');
    });

    it('应该处理没有控制器注解的类', async () => {
      const javaCode = `
package com.example.service;

public class UserService {
    public User findById(Long id) {
        return repository.findById(id);
    }
}`;

      const result = await JavaASTParser.parseFile('/test/UserService.java', javaCode);

      expect(result).toEqual([]);
    });

    it('应该解析复杂的路径组合', async () => {
      const javaCode = `
package com.example.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ApiController {
    
    @RequestMapping(value = "/users/{userId}/posts/{postId}", method = RequestMethod.GET)
    public Post getUserPost(@PathVariable Long userId, @PathVariable Long postId) {
        return postService.findUserPost(userId, postId);
    }
}`;

      const result = await JavaASTParser.parseFile('/test/ApiController.java', javaCode);

      expect(result.length).toBe(1);
      expect(result[0].path).toBe('/api/v1/users/{userId}/posts/{postId}');
      expect(result[0].method).toBe('GET');
    });
  });

  describe('静态方法测试', () => {
    it('应该识别 Spring 控制器注解', () => {
      // 访问静态属性进行测试
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