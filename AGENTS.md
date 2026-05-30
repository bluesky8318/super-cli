# AGENTS.md

本文件为 AI agent 在本仓库中工作时提供指引。

## 项目概述

`super-cli` 是一个 Claude Code session 管理工具，提供：
1. **Session 索引与搜索** — 快速列出、查看、搜索所有历史 Claude Code sessions
2. **任务命名与标签** — 给 session 命名/打标签，视为 task 管理
3. **CLI 模式** — Agent-friendly 命令行交互，支持 `--json` 结构化输出
4. **Web 模式** — 启动 HTTP 服务，在浏览器中查看 Dashboard、会话详情、搜索等

## 开发环境

- 语言：TypeScript 5.x（strict 模式）
- 运行时：Node.js >= 22
- 包管理器：pnpm
- CLI框架：Commander.js
- HTTP服务器：Fastify 5
- 前端：React 19 + Vite + TailwindCSS 4
- 构建：tsup (CLI/Server) + Vite (Web frontend)
- 测试：Vitest
- 模块系统：ESM (`"type": "module"`)
- 构建产物输出到 `dist/`

## 约定

- Commit message 用英文，祈使句风格
- 代码和注释用英文；面向用户的字符串可以用中文
- 使用 ESM（package.json 中 `"type": "module"`）
- 不做独立数据存储，直接读取 `~/.claude/` 下的 JSONL 文件
- 仅在 `~/.super-cli/config.json` 存储用户标签/命名配置

## 项目结构

```
src/
├── cli/           # CLI 入口与命令 (ccm list/show/search/name/tasks/stats/serve/config)
├── core/          # 核心数据层 (session-reader, session-index, session-search, task-store)
├── server/        # Fastify HTTP 服务器 + REST API
└── web/           # React 前端 SPA
```

## 架构要点

- Claude Code session 数据存储在 `~/.claude/projects/<encoded-path>/<uuid>.jsonl`
- 路径编码规则：`/` → `-`，如 `/Users/leon/work/foo` → `-Users-leon-work-foo`
- CLI 和 Web Server 共享 `src/core/` 数据层
- CLI 直接读取文件，Web 通过 `/api/` REST 接口访问同一数据层
- 构建顺序：`tsup` (CLI+Server) → `vite build` (Web frontend 到 dist/web/)

## CLI 命令

```bash
super-cli list [--project] [--since] [--branch] [--limit] [--json]
super-cli show <id> [--summary|--messages|--tools] [--json]
super-cli search <query> [--project] [--since] [--max] [--json]
super-cli name <id> [label] [--remove] [--tag] [--untag]
super-cli tasks [--tag] [--json]
super-cli stats [--daily] [--model] [--json]
super-cli serve [--port] [--host] [--open]
super-cli config [show|set|get|path]
```
