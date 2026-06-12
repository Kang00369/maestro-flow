// src/graph/kg/resolution/frameworks/index.ts
// 24 框架解析器注册表 — 从 CodeGraph 复用
// 参考: codegraph/src/resolution/frameworks/index.ts (21 文件, 24 resolver 实例)

export interface FrameworkResolver {
  name: string;
  language: string;
  detect(files: string[]): boolean;
  resolve?(nodes: Array<{ id: string; name: string; filePath: string }>): Array<{ source: string; target: string; kind: string }>;
}

// ---------------------------------------------------------------------------
// 框架解析器注册表
// 完整版: 逐个从 CodeGraph 移植各 resolver
// 当前: 骨架 + detect 函数 (通过 package.json / 文件特征检测)
// ---------------------------------------------------------------------------

function detectByPackageJson(files: string[], deps: string[]): boolean {
  const pkgFiles = files.filter(f => f.endsWith('package.json'));
  // 简化: 有 package.json 就假设可能命中 (完整版需读取并解析)
  return pkgFiles.length > 0;
}

function detectByFilePattern(files: string[], patterns: RegExp[]): boolean {
  return files.some(f => patterns.some(p => p.test(f)));
}

const RESOLVERS: FrameworkResolver[] = [
  // --- JavaScript/TypeScript 框架 ---
  {
    name: 'express',
    language: 'javascript',
    detect: (files) => detectByPackageJson(files, ['express']),
  },
  {
    name: 'nestjs',
    language: 'typescript',
    detect: (files) => detectByPackageJson(files, ['@nestjs/core']),
  },
  {
    name: 'react',
    language: 'javascript',
    detect: (files) => detectByPackageJson(files, ['react']),
  },
  {
    name: 'react-native-legacy',
    language: 'javascript',
    detect: (files) => detectByPackageJson(files, ['react-native']),
  },
  {
    name: 'react-native-turbomodules',
    language: 'javascript',
    detect: (files) => detectByPackageJson(files, ['react-native']) && files.some(f => f.includes('TurboModule')),
  },
  {
    name: 'expo-modules',
    language: 'typescript',
    detect: (files) => detectByPackageJson(files, ['expo']),
  },
  {
    name: 'svelte',
    language: 'javascript',
    detect: (files) => detectByFilePattern(files, [/\.svelte$/]),
  },
  {
    name: 'vue',
    language: 'javascript',
    detect: (files) => detectByFilePattern(files, [/\.vue$/]),
  },

  // --- Python 框架 ---
  {
    name: 'django',
    language: 'python',
    detect: (files) => files.some(f => f.includes('manage.py') || f.includes('settings.py')),
  },
  {
    name: 'flask',
    language: 'python',
    detect: (files) => files.some(f => f.includes('app.py') || f.includes('wsgi.py')),
  },
  {
    name: 'fastapi',
    language: 'python',
    detect: (files) => files.some(f => f.includes('main.py')),
  },

  // --- Ruby 框架 ---
  {
    name: 'rails',
    language: 'ruby',
    detect: (files) => files.some(f => f.includes('Gemfile') || f.includes('config/routes.rb')),
  },

  // --- Go 框架 ---
  {
    name: 'gin',
    language: 'go',
    detect: (files) => files.some(f => f.endsWith('go.mod')),
  },
  {
    name: 'go-standard',
    language: 'go',
    detect: (files) => files.some(f => f.endsWith('go.mod')),
  },

  // --- Rust 框架 ---
  {
    name: 'actix-web',
    language: 'rust',
    detect: (files) => files.some(f => f.endsWith('Cargo.toml')),
  },
  {
    name: 'axum',
    language: 'rust',
    detect: (files) => files.some(f => f.endsWith('Cargo.toml')),
  },

  // --- Java 框架 ---
  {
    name: 'spring',
    language: 'java',
    detect: (files) => files.some(f => f.includes('pom.xml') || f.includes('build.gradle')),
  },
  {
    name: 'play-framework',
    language: 'java',
    detect: (files) => files.some(f => f.includes('build.sbt')),
  },

  // --- PHP 框架 ---
  {
    name: 'laravel',
    language: 'php',
    detect: (files) => files.some(f => f.includes('artisan')),
  },
  {
    name: 'drupal',
    language: 'php',
    detect: (files) => files.some(f => f.includes('core/lib/Drupal')),
  },

  // --- C# 框架 ---
  {
    name: 'aspnet',
    language: 'csharp',
    detect: (files) => files.some(f => f.endsWith('.csproj') || f.endsWith('.sln')),
  },

  // --- Swift 框架 ---
  {
    name: 'swiftui',
    language: 'swift',
    detect: (files) => detectByFilePattern(files, [/\.swift$/]),
  },
  {
    name: 'uikit',
    language: 'swift',
    detect: (files) => detectByFilePattern(files, [/\.swift$/]),
  },
  {
    name: 'vapor',
    language: 'swift',
    detect: (files) => files.some(f => f.includes('Package.swift')),
  },
];

// ---------------------------------------------------------------------------
// 查询 API
// ---------------------------------------------------------------------------

export function getRegisteredFrameworks(): FrameworkResolver[] {
  return RESOLVERS;
}

export function detectFrameworks(files: string[]): string[] {
  return RESOLVERS.filter(r => r.detect(files)).map(r => r.name);
}

export function getFrameworkResolver(name: string): FrameworkResolver | null {
  return RESOLVERS.find(r => r.name === name) ?? null;
}