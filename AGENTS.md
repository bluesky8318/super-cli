# AGENTS.md

本文件为 AI agent 在本仓库中工作时提供指引。

## 项目概述

`super-cli` 是一个 AI 编程助手 session 管理工具，支持 Claude Code、Qoder、Codex、Kimi CLI、Pi、OpenCode、WorkBuddy、TraeCode 多个 provider，提供：

1. **Session 索引与搜索** — 快速列出、查看、搜索所有历史 session
2. **任务命名与标签** — 给 session 命名/打标签，视为 task 管理（带状态看板）
3. **Issue 看板** — 独立的 issue 实体（7 状态、优先级、标签、评论、父子/依赖关系、乐观锁、SSE 实时推送），可绑定多个不同 provider 的 session；agent 工作流见 `docs/issue-workflow.md`
4. **个人微信看板** — 灵感板块的独立功能，复用本机 wx-cli server 只读 HTTP API（`core/wechat.ts` 聚合层 + `server/routes/wechat.ts` 代理），不落库；配置项 `wechatUrl`/`wechatToken`/`wechatNames`
4. **想法（Idea）** — 一句话随时记录（draft，存 `~/.super-cli/ideas.json`）→ 分类后落到分类项目的 `00-Inbox/Idea/<yyyy>/<yyyy>-<mm>/` md 文档（incubating，md 为唯一事实源，agent 可按格式直接编辑）→ 成熟后转为 issue（md 成为原始需求文档，任务状态回显）；未分类不能评论/转任务；放弃/归档均可恢复（有分类回孵化中，无分类回待分类），不可删除；记录入口为全局悬浮输入（任意页面）。分类（名称→项目路径）在系统配置 `settings.ideaCategories` 维护
5. **Agent 启动配置** — `~/.super-cli/agents.json`，一个 profile 两种启动模式：交互（新建会话，开终端窗口）与无头（issue run，后台执行，仅 claude-code/codex/pi）
4. **CLI 模式** — Agent-friendly 命令行交互，支持 `--json` 结构化输出
5. **Web 模式** — 启动 HTTP 服务，在浏览器中查看 Dashboard、会话详情、搜索等

直接读取 `~/.claude/`、`~/.qoder/`、`~/.codex/` 下的 JSONL 文件，无数据库，无外部 API 调用。仅在 `~/.super-cli/config.json` 存储用户标签/命名配置，在 `~/.super-cli/issues.json` 存储 issue 看板数据。

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
├── cli/          # Commander.js CLI 入口 + 子命令（list/show/search/name/tasks/issue/skill/stats/serve/config）
├── core/         # 共享数据层 — 纯读取逻辑，不依赖 HTTP 或 CLI 框架
│   ├── session-reader.ts   # 流式读取 JSONL 文件，从原始消息中提取元数据
│   ├── session-index.ts    # 跨项目的全量 session 内存索引
│   ├── task-store.ts       # 读写 ~/.super-cli/config.json（标签/命名持久化）
│   ├── issue-store.ts      # 读写 ~/.super-cli/issues.json（issue/评论/关系/活动日志，乐观锁）
│   ├── idea-store.ts       # 读写 ~/.super-cli/ideas.json（想法捕获与 promote）
│   ├── agent-store.ts      # 读写 ~/.super-cli/agents.json（agent 启动配置，内置 profile 初始化）
│   ├── task-runner.ts      # issue 无头执行（spawn headless CLI、session 捕获、runs 审计投影）
│   ├── issue-skill.ts      # 加载 skills/super-cli-taskboard/SKILL.md（构建时内联）
│   ├── skill-installer.ts  # skill 安装/卸载/状态检测（global: ~/ 下各 provider 目录的 skills/，project: 项目内 .<provider>/skills）
│   ├── providers.ts        # Provider 注册表（claude-code, qoder, codex），含命令和恢复参数
│   ├── paths.ts            # 路径工具：项目路径编码、session 文件路径、各 CLI home 目录
│   ├── terminal-launcher.ts # macOS 终端集成（ghostty, iTerm2, Terminal.app, kitty, Warp）
│   └── types.ts            # 全部共享 TypeScript 类型
├── server/       # Fastify 5 HTTP 服务器 — /api/* REST 接口，同时托管 dist/web/ 静态资源
│   ├── events.ts # EventHub：SSE 广播（GET /api/events），issue 变更实时推送
│   └── routes/   # sessions.ts, tasks.ts, issues.ts, stats.ts, projects.ts, config.ts
└── web/          # React 19 SPA — 独立 vite.config.ts，不在根 tsconfig.json 中
    └── src/      # App.tsx（单文件 SPA）、ConfigView.tsx、components/（IssueCard/IssueDetail/NewIssueModal）、api/client.ts、index.css（Tailwind 4）
skills/           # 随包分发的 agent skill（super-cli-taskboard/SKILL.md），`skill install` 安装到各 provider 的 skills 目录
```

## 架构要点

- Claude Code session 数据存储在 `~/.claude/projects/<encoded-path>/<uuid>.jsonl`
- 路径编码规则：`/` → `-`，如 `/Users/alice/work/foo` → `-Users-alice-work-foo`（见 `paths.ts:encodeProjectPath`）
- CLI 和 Server 共享 `src/core/` 数据层
- CLI 直接调用 core，Server 通过 `/api/*` REST 接口暴露同一数据层
- Web 前端通过 `src/web/src/api/client.ts` 调用 REST 接口
- 构建流程：tsup 打包 CLI+Server → vite 打包前端 → `dist/`；Server 运行时托管 `dist/web/`

## 多 Provider 设计

`CliProvider` 类型为 `'claude-code' | 'qoder' | 'codex' | 'kimi' | 'pi' | 'opencode' | 'workbuddy' | 'traecode'`。每个 provider 在 `providers.ts` 中注册，包含 CLI 命令、新建/恢复 session 参数、home 目录和 `sessionLayout`（session 存储布局：目录、项目名编码方式、文件名模式）。`SessionReader` 按 `sessionLayout` 读取各 provider 数据并将消息规范化为 Claude 风格；无 `sessionLayout` 的 provider（opencode/traecode）暂不做 session 索引。已知布局：claude-code/qoder `projects/-dash-encoded/<uuid>.jsonl`；kimi `sessions/<md5(cwd)>/<uuid>/context.jsonl`（路径映射在 `kimi.json` work_dirs）；pi `agent/sessions/--dash-encoded--/<ts>_<uuid>.jsonl`（cwd 只在首行 session meta）；workbuddy `projects/<dash-no-prefix>/<uuid>.jsonl`。项目列表按解码后的绝对路径跨 provider 合并（`aliases` 保留各 provider 原始编码）。CLI 全局 `--provider` 参数用于跨命令过滤。

## 约定

- 全程 ESM（`"type": "module"`，import 时使用 `.js` 扩展名）
- TypeScript strict 模式；`tsc --noEmit` 不包含 `src/web/`（前端有独立的 vite 构建流程）
- Commit message 用英文，祈使句风格
- 代码注释用英文；面向用户的字符串可以用中文
- 无独立数据库，只读 `~/.claude/` JSONL，只写 `~/.super-cli/config.json`（标签/命名）和 `~/.super-cli/issues.json`（issue 看板）
- tsconfig 中定义了 `@core/*`、`@cli/*`、`@server/*` 路径别名，由 tsup 在构建时解析

## CLI 命令参考

```bash
super-cli list [--project] [--since] [--branch] [--limit] [--json]
super-cli show <id> [--summary|--messages|--tools] [--json]
super-cli search <query> [--project] [--since] [--max] [--json]
super-cli name <id> [label] [--remove] [--tag] [--untag]
super-cli tasks [--tag] [--json]
super-cli issue list [--project] [--status] [--archived] [--json]
super-cli issue show <id> [--comments] [--activity] [--json]
super-cli issue create --title <t> [--project] [--priority] [--label] [--desc] [--json]
super-cli issue update <id> [--title] [--desc] [--priority] [--label] [--if-version N]
super-cli issue move <id> <status> [--if-version N] [--json]
super-cli issue claim <id> [--session-id <s>] [--json]
super-cli issue archive|restore|delete <id> [--if-version N]
super-cli issue bind|unbind <id> <sessionId> [--if-version N]
super-cli issue comment <id> [--add <body>] [--agent] [--session-id] [--after] [--json]
super-cli issue relate|unrelate <id> <parent|blocks|related> <targetId>
super-cli issue run <id> [--agent <name>] [--json]   # 无头执行（claude-code/codex/pi）
super-cli issue runs <id> [--json]
super-cli issue stop <id>
super-cli idea add <content>                     # 一句话记录（draft）
super-cli idea list [--status] [--category] [--project] [--json]
super-cli idea show <id> [--json]
super-cli idea categorize <id> <category>        # 分类 → 落 md 文档
super-cli idea categories [--json]               # 列出分类（含内置默认）
super-cli idea comment <id> <body>               # 追加评论/修正（写入 md）
super-cli idea promote <id> [--title] [--project] [--priority]   # 转为任务
super-cli idea abandon <id>                      # 放弃（可恢复）
super-cli idea archive <id>                      # 归档（可恢复）
super-cli idea restore <id>                      # 恢复已放弃/已归档的
super-cli agent list|add|show|edit|remove [--json]
super-cli skill list [--json]
super-cli skill install|uninstall [--agent a,b] [--global|--project] [-y] [--json]
super-cli skill path [--json]
super-cli stats [--daily] [--model] [--json]
super-cli serve [--port] [--host] [--open]
super-cli config [show|set|get|path]
```
