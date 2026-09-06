# AGENTS.md

本文件为 AI agent 在本仓库中工作时提供指引。

## 项目概述

`super-cli` 是一个 AI 编程助手 session 管理工具，支持 Claude Code、Qoder、Codex、Kimi CLI、Pi、OpenCode、WorkBuddy、TraeCode 多个 provider，提供：

1. **Session 索引与搜索** — 快速列出、查看、搜索所有历史 session
2. **任务命名与标签** — 给 session 命名/打标签，视为 task 管理（带状态看板）
3. **CLI 模式** — Agent-friendly 命令行交互，支持 `--json` 结构化输出
4. **Web 模式** — 启动 HTTP 服务，在浏览器中查看 Dashboard、会话详情、搜索等

直接读取 `~/.claude/`、`~/.qoder/`、`~/.codex/` 下的 JSONL 文件，无数据库，无外部 API 调用。仅在 `~/.super-cli/config.json` 存储用户标签/命名配置。

## 开发环境

- 语言：TypeScript 5.x（strict 模式）
- 运行时：Node.js >= 22
- 包管理器：pnpm
- CLI 框架：Commander.js
- HTTP 服务器：Fastify 5
- 前端：React 19 + Vite + TailwindCSS 4
- 构建：tsup (CLI/Server) + Vite (Web frontend)
- 测试：Vitest
- 模块系统：ESM (`"type": "module"`)

## 常用命令

```bash
pnpm build              # 完整构建：tsup 打包 CLI/Server + vite 打包前端 → dist/
pnpm build:cli          # 仅构建 CLI + Server（tsup）
pnpm build:web          # 仅构建前端 React SPA → dist/web/
pnpm dev                # CLI/Server 开发模式（tsup --watch）
pnpm dev:web            # 前端开发服务器（/api 自动代理到 localhost:3000）
pnpm test               # 运行 vitest 测试
pnpm typecheck          # TypeScript 类型检查（不含 src/web/）
pnpm start              # 运行构建产物：node dist/cli/index.js
```

运行单个测试文件：`pnpm test -- path/to/file.test.ts`

## 项目结构

```
src/
├── cli/          # Commander.js CLI 入口 + 子命令（list/show/search/name/tasks/stats/serve/config）
├── core/         # 共享数据层 — 纯读取逻辑，不依赖 HTTP 或 CLI 框架
│   ├── session-reader.ts   # 流式读取 JSONL 文件，从原始消息中提取元数据
│   ├── session-index.ts    # 跨项目的全量 session 内存索引
│   ├── task-store.ts       # 读写 ~/.super-cli/config.json（标签/命名持久化）
│   ├── providers.ts        # Provider 注册表（claude-code, qoder, codex），含命令和恢复参数
│   ├── paths.ts            # 路径工具：项目路径编码、session 文件路径、各 CLI home 目录
│   ├── terminal-launcher.ts # macOS 终端集成（ghostty, iTerm2, Terminal.app, kitty, Warp）
│   └── types.ts            # 全部共享 TypeScript 类型
├── server/       # Fastify 5 HTTP 服务器 — /api/* REST 接口，同时托管 dist/web/ 静态资源
│   └── routes/   # sessions.ts, tasks.ts, stats.ts, projects.ts, config.ts
└── web/          # React 19 SPA — 独立 vite.config.ts，不在根 tsconfig.json 中
    └── src/      # App.tsx（单文件 SPA）、ConfigView.tsx、api/client.ts、index.css（Tailwind 4）
```

## 架构要点

- Claude Code session 数据存储在 `~/.claude/projects/<encoded-path>/<uuid>.jsonl`
- 路径编码规则：`/` → `-`，如 `/Users/alice/work/foo` → `-Users-alice-work-foo`（见 `paths.ts:encodeProjectPath`）
- CLI 和 Server 共享 `src/core/` 数据层
- CLI 直接调用 core，Server 通过 `/api/*` REST 接口暴露同一数据层
- Web 前端通过 `src/web/src/api/client.ts` 调用 REST 接口
- 构建流程：tsup 打包 CLI+Server → vite 打包前端 → `dist/`；Server 运行时托管 `dist/web/`

## 多 Provider 设计

`CliProvider` 类型为 `'claude-code' | 'qoder' | 'codex' | 'kimi' | 'pi' | 'opencode' | 'workbuddy' | 'traecode'`。每个 provider 在 `providers.ts` 中注册，包含 CLI 命令、新建/恢复 session 参数和 home 目录。`SessionReader` 接受 provider 参数以读取对应 `~/.<provider>/` 目录下的数据。CLI 全局 `--provider` 参数用于跨命令过滤。

## 约定

- 全程 ESM（`"type": "module"`，import 时使用 `.js` 扩展名）
- TypeScript strict 模式；`tsc --noEmit` 不包含 `src/web/`（前端有独立的 vite 构建流程）
- Commit message 用英文，祈使句风格
- 代码注释用英文；面向用户的字符串可以用中文
- 无独立数据库，只读 `~/.claude/` JSONL，只写 `~/.super-cli/config.json`
- tsconfig 中定义了 `@core/*`、`@cli/*`、`@server/*` 路径别名，由 tsup 在构建时解析

## CLI 命令参考

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
