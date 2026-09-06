本页是 super-cli 知识库的起点。你将在这里了解：这个工具解决什么问题、它管理哪些 AI 编程助手的数据、整体架构如何分层，以及为什么「统一管理」是它的核心价值。读完本页后，你可以按文末的阅读路径进入快速上手或深入解析章节。

## super-cli 是什么

**super-cli 是一个 AI 编程助手会话（session）管理工具**：它把 Claude Code、Qoder、Codex 三款 AI 编程 CLI 工具产生的历史对话统一收纳到一处，同时提供命令行（CLI）和浏览器看板（Web Dashboard）两种交互方式。项目以 npm 包 `@bluesky8318/super-cli` 发布（当前版本 0.2.1），一行 `super-cli` 命令即可启动，运行在 Node.js 22+ 环境下，采用纯 ESM 模块规范。

Sources: [README.md](README.md#L1-L4)、[package.json](package.json#L1-L5)、[package.json](package.json#L44-L47)

它的技术选型如下表所示——每个技术都服务于一个明确目标：轻量、无侵入、单进程可跑：

| 层次 | 技术 | 在项目中的角色 |
|---|---|---|
| CLI 命令 | Commander.js | 注册 `list` / `show` / `search` 等子命令 |
| HTTP 服务 | Fastify 5 | 为 Web 看板提供 REST API 并托管前端静态资源 |
| 前端 | React 19 + Vite + TailwindCSS 4 | 单页应用：看板、卡片、列表三视图 |
| 语法高亮 | Prism.js | 项目文件浏览器中 20+ 种语言高亮 |
| 构建 | tsup（Node 端）+ Vite（Web 端） | 双构建流水线，产物统一输出到 `dist/` |
| 测试 / 类型检查 | Vitest + tsc | 保证 core 层解析逻辑的正确性 |
| 运行时 | Node.js ≥ 22（ESM） | 唯一外部依赖，无需 Docker 或数据库 |

Sources: [README.md](README.md#L122-L134)、[package.json](package.json#L26-L35)

## 为什么需要统一管理

理解 super-cli 的价值，先要看它所处的真实困境。假设你同时在用 Claude Code 和 Codex 开发同一个项目：Claude Code 的会话记录以 JSONL 文件形式存放在 `~/.claude/projects/` 下，Codex 的存放在 `~/.codex/sessions/` 下，两者的目录结构、文件命名、消息格式**完全不同**。当你想回答一些朴素的问题时，成本立刻显现——「上周三我在 Codex 里做了什么？」「这个功能最初是在哪个工具里讨论的？」「我总共消耗了多少 token？」——每款工具都有自己的历史界面，但没有一个地方能跨工具回答这些问题。

更具体的痛点包括：**会话数据散落在三个隐藏目录中**，普通开发者根本不知道去哪里找；**会话没有任务语义**，原生工具只记流水账，不会告诉你哪些对话是「进行中的任务」、哪些是「已完成的工作」；**上下文难以恢复**，想接着三天前的对话继续干，需要先找到是哪个工具、哪个 session ID。super-cli 的定位正是补上这一层缺失的「管理面」：它不改变任何 AI 工具的行为，只做**只读聚合 + 轻量标注 + 一键恢复**。

值得强调的设计决策是：**super-cli 不依赖任何数据库，也不建立自己的数据副本**。它直接读取各 CLI 工具已经写在本地的数据文件，唯一的自有写入是 `~/.super-cli/config.json`（存放你给会话起的名称、标签等用户配置）。这意味着零迁移成本、零同步问题——删掉 super-cli，你的 AI 工具数据毫发无损。

Sources: [README.md](README.md#L147-L156)、[src/core/paths.ts](src/core/paths.ts#L34-L40)

## 三大 Provider：统一管理的对象

super-cli 用 **Provider（提供方）** 这个概念指代被管理的每款 AI 编程 CLI 工具。Provider 的注册信息集中在 `src/core/providers.ts` 的一个静态数组里，每项包含工具 ID、显示名、可执行命令、新建/恢复会话的参数模板，以及数据根目录：

| Provider ID | 名称 | 可执行命令 | 恢复会话参数 | 数据目录 |
|---|---|---|---|---|
| `claude-code` | Claude Code | `claude` | `--resume <id>` | `~/.claude` |
| `qoder` | Qoder CLI | `qodercli` | `--resume <id>` | `~/.qoder` |
| `codex` | Codex CLI | `codex` | `resume <id>` | `~/.codex` |

Sources: [src/core/providers.ts](src/core/providers.ts#L15-L40)、[src/core/types.ts](src/core/types.ts#L1-L1)

注意 Codex 的恢复参数形式与其他两家不同（`resume` 是位置参数而非 `--resume` 选项）——这正是「恢复会话」逻辑需要 Provider 注册表的原因。注册表还提供 `getAvailableProviders()`：通过检测数据目录是否存在，自动跳过机器上未安装的工具，所以三缺一也能正常使用。

Sources: [src/core/providers.ts](src/core/providers.ts#L46-L48)

各 Provider 的会话数据落盘位置如下表。前两者的目录布局一致（`projects/<编码后的项目路径>/<uuid>.jsonl`，路径中的 `/` 被替换成 `-`），而 Codex 采用了完全不同的 `sessions/` 目录结构——这个异构性由后文提到的 Reader 层来抹平：

| 数据来源 | 本地路径 |
|---|---|
| Claude Code 会话 | `~/.claude/projects/<编码路径>/<uuid>.jsonl` |
| Qoder 会话 | `~/.qoder/projects/<编码路径>/<uuid>.jsonl` |
| Codex 会话 | `~/.codex/sessions/` |
| 用户标签 / 命名 / 设置 | `~/.super-cli/config.json` |

Sources: [README.md](README.md#L149-L156)、[src/core/paths.ts](src/core/paths.ts#L42-L53)

## 整体架构：cli / core / server / web 四层

super-cli 的源码分为四个目录，各自职责边界清晰：**core 是数据与逻辑核心，cli 与 server 是它的两个消费入口，web 是 server 托管的前端界面**。下面的架构图展示了数据流向——先解释读图前提：图中的箭头表示「调用/读取」关系；CLI 命令不经过 HTTP，直接实例化 core 层的 `SessionIndex`，而浏览器则通过 Fastify 的 REST API 间接访问同一个 `SessionIndex`，两条路径在 core 层汇合，保证两边看到的数据逻辑完全一致。

```mermaid
flowchart TB
    subgraph 入口层
        CLI["终端用户<br/>super-cli 命令"]
        SERVE["super-cli serve"]
        BROWSER["浏览器"]
    end

    subgraph 接口层
        CMDS["CLI 子命令 (cli/commands)<br/>list · show · search · name<br/>tasks · stats · config · serve"]
        ROUTES["Fastify 5 路由 (server/routes)<br/>/api/sessions · /tasks · /stats<br/>/projects · /config · /refresh"]
        SPA["React SPA (web)<br/>看板 / 卡片 / 列表 · 文件浏览器<br/>Harness 配置中心 · 三主题"]
    end

    subgraph 核心层 core
        INDEX["SessionIndex<br/>统一内存索引 + 30s TTL 缓存"]
        STORE["TaskStore<br/>会话命名 / 标签 / 设置"]
        REG["Provider 注册表<br/>claude-code · qoder · codex"]
    end

    subgraph Reader 适配层
        SR["SessionReader<br/>解析 ~/.claude 与 ~/.qoder 的 JSONL"]
        CR["CodexReader<br/>适配 ~/.codex 异构数据并翻译为统一格式"]
    end

    subgraph 本地数据（只读）
        F1["~/.claude/projects/**/*.jsonl"]
        F2["~/.qoder/projects/**/*.jsonl"]
        F3["~/.codex/sessions/**"]
        F4["~/.super-cli/config.json（读写）"]
    end

    CLI --> CMDS
    SERVE --> ROUTES
    BROWSER --> SPA
    SPA -- "REST API" --> ROUTES
    CMDS --> INDEX
    ROUTES --> INDEX
    INDEX --> SR
    INDEX --> CR
    INDEX --> STORE
    STORE --> F4
    SR --> F1
    SR --> F2
    CR --> F3
    INDEX -.-> REG
```

Sources: [src/cli/index.ts](src/cli/index.ts#L20-L29)、[src/server/index.ts](src/server/index.ts#L18-L48)、[src/core/session-index.ts](src/core/session-index.ts#L41-L64)

这张图背后的关键设计可以概括为三点。**第一，core 层是唯一的数据通道**：CLI 的 `list` 命令直接 `new SessionIndex()`（见 [list.ts](src/cli/commands/list.ts#L17-L20)），而 server 在启动时创建一个共享的 `SessionIndex` 实例并注入所有路由处理器，避免多个缓存各自为政。**第二，Reader 层用接口抹平差异**：`ISessionReader` 规定了 `listProjects` / `streamSession` / `readSessionMetadata` 等统一方法，`SessionReader` 服务于 Claude Code 与 Qoder（两者格式同源），`CodexReader` 单独适配 Codex 并把它的消息翻译成统一格式。**第三，数据是流式读取的**：会话文件按行流式解析（readline + AsyncGenerator），大文件不会一次性载入内存。

Sources: [src/core/session-index.ts](src/core/session-index.ts#L9-L17)、[src/core/session-index.ts](src/core/session-index.ts#L49-L64)、[src/core/session-reader.ts](src/core/session-reader.ts#L39-L50)

对于初学者，可以先把 `SessionIndex` 理解为一个「聚合器」：它扫描所有可用 Provider 的所有项目目录，把每个会话文件的元数据（时间、消息数、模型、Git 分支、token 用量等）提取成统一的 `SessionMetadata` 结构缓存在内存里，30 秒 TTL 过期后自动重建。会话状态（待办/进行中/待复查/已完成/已取消）也在这里推断——优先看你手动打的标签，其次看是否有活跃进程，最后按「最后活动时间 + 消息量」做启发式判断。

Sources: [src/core/types.ts](src/core/types.ts#L55-L76)、[src/core/session-index.ts](src/core/session-index.ts#L21-L39)

## 两种使用方式：CLI 与 Web 看板

同一份 core 能力，面向两类场景开放。**CLI 模式适合快速查询与脚本集成**——所有命令支持 `--json` 结构化输出，专为 AI Agent 和自动化脚本设计；全局 `--provider` 参数可过滤单一工具的数据。**Web 模式适合浏览与管理工作流**——看板视图按状态分列呈现任务，卡片/列表视图支持排序，项目详情浮层内嵌只读文件浏览器（含语法高亮与 Markdown 渲染），还能一键在 Ghostty / iTerm2 / Terminal.app / Kitty / Warp 终端中恢复会话。

| 维度 | CLI 模式 | Web 看板模式 |
|---|---|---|
| 启动方式 | `super-cli <命令>` | `super-cli serve --port 3000 --open` |
| 典型用途 | 查询、搜索、脚本/Agent 集成 | 任务看板管理、会话浏览、配置查看 |
| 数据交互 | 单次执行，进程即退 | 常驻服务，实时刷新（30s TTL） |
| 结构化输出 | 每个命令均支持 `--json` | 浏览器界面，REST API 也可直接调用 |
| 特色能力 | ID 前缀匹配、全文搜索 | 三视图、三主题、文件浏览器、右键菜单 |

Sources: [README.md](README.md#L59-L120)、[src/cli/index.ts](src/cli/index.ts#L14-L18)

命令层一共注册了 8 个子命令，覆盖完整的管理闭环：`list`（列出会话）、`show`（查看详情）、`search`（跨会话全文搜索）、`name`（命名/打标签）、`tasks`（查看任务看板）、`stats`（使用统计）、`config`（配置管理）、`serve`（启动 Web 服务）。

Sources: [src/cli/index.ts](src/cli/index.ts#L20-L27)

## 阅读路径建议

读完本页，你已经建立了 super-cli 的全局认知。接下来的路径取决于你的目标：如果想立刻跑起来，先读安装与首次运行；如果想理解代码组织，按仓库结构导览 → 数据层核心的顺序推进。

**路径一：快速上手（推荐所有读者按序完成）**
1. [快速开始：安装、构建与首次运行（CLI 与 Web 看板）](2-kuai-su-kai-shi-an-zhuang-gou-jian-yu-shou-ci-yun-xing-cli-yu-web-kan-ban) — 安装包、启动 CLI 与 Web 看板
2. [开发环境与常用命令（pnpm dev / dev:web / test / typecheck / build）](3-kai-fa-huan-jing-yu-chang-yong-ming-ling-pnpm-dev-dev-web-test-typecheck-build) — 本地开发工作流
3. [仓库结构导览：cli / core / server / web 四层职责划分](4-cang-ku-jie-gou-dao-lan-cli-core-server-web-si-ceng-zhi-ze-hua-fen) — 与本页架构图对照的目录级详解

**路径二：理解核心设计（适合想读懂源码的读者）**
- [多 Provider 架构：Claude Code、Qoder、Codex 的注册表设计](5-duo-provider-jia-gou-claude-code-qoder-codex-de-zhu-ce-biao-she-ji) — 本页 Provider 表的展开
- [JSONL 会话文件流式解析与元数据提取（readline + AsyncGenerator）](6-jsonl-hui-hua-wen-jian-liu-shi-jie-xi-yu-yuan-shu-ju-ti-qu-readline-asyncgenerator) — Reader 层的解析细节
- [SessionIndex 全量内存索引与 TTL 缓存策略](8-sessionindex-quan-liang-nei-cun-suo-yin-yu-ttl-huan-cun-ce-lue) — 聚合器内部的缓存机制
- [会话状态推断与任务看板模型（backlog / in_progress / review / done / cancelled）](10-hui-hua-zhuang-tai-tui-duan-yu-ren-wu-kan-ban-mo-xing-backlog-in_progress-review-done-cancelled) — 状态启发式规则的完整逻辑

**路径三：面向特定场景**
- 主要想用 Web 看板管理任务 → [双模式 SPA 架构：任务模式与 Harness 配置模式的视图切换](16-shuang-mo-shi-spa-jia-gou-ren-wu-mo-shi-yu-harness-pei-zhi-mo-shi-de-shi-tu-qie-huan)
- 想写脚本集成 super-cli → [Agent 友好的 --json 结构化输出约定与终端格式化输出](13-agent-you-hao-de-json-jie-gou-hua-shu-chu-yue-ding-yu-zhong-duan-ge-shi-hua-shu-chu) 与 [Fastify 5 REST API 参考](14-fastify-5-rest-api-can-kao-sessions-tasks-stats-projects-config-refresh)
- 想了解会话数据长什么样 → [路径编码规则与各 CLI 数据目录布局（~/.claude、~/.qoder、~/.codex）](21-lu-jing-bian-ma-gui-ze-yu-ge-cli-shu-ju-mu-lu-bu-ju-claude-qoder-codex)