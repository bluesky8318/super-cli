打开 `src/` 目录，你会看到四个子目录：`cli`、`core`、`server`、`web`。这不是随意的文件摆放，而是一套刻意设计的**分层架构**——每一层有唯一明确的职责，层与层之间的依赖方向被严格固定。理解这四层，是读懂本仓库所有代码的前提：后续文档中的每一个主题（会话解析、REST API、React 看板、构建流水线），最终都会落回这四个目录中的某个位置。本页将带你逐层拆解它们的职责边界、依赖规则，以及它们如何在构建后汇成一个可发布的产品。

Sources: [AGENTS.md](AGENTS.md#L6-L12)

## 全景：一张图看懂四层架构

在阅读下面的图之前，先明确一个前提：super-cli 是一个**无数据库、无外部 API 依赖**的本地工具——它直接读取磁盘上 `~/.claude/`、`~/.qoder/`、`~/.codex/` 三个目录下的 JSONL 会话文件，唯一的写入位置是 `~/.super-cli/config.json`（存用户打的标签和命名）。理解了"数据在磁盘上、工具只负责读和展示"，下面的架构图就一目了然。

下面的 Mermaid 图展示了四层之间的静态依赖（谁 import 谁）与运行时数据流（数据从哪流向哪）：

```mermaid
flowchart TB
    subgraph external["磁盘上的数据源"]
        CLAUDE["~/.claude/"]
        QODER["~/.qoder/"]
        CODEX["~/.codex/"]
    end

    subgraph src["src/ 四层架构"]
        CORE["core<br/>数据与业务核心层<br/>（17 个模块）"]
        CLI["cli<br/>命令行入口层<br/>（Commander.js）"]
        SERVER["server<br/>HTTP 服务层<br/>（Fastify 5）"]
        WEB["web<br/>React SPA 前端<br/>（Vite 构建）"]
    end

    CLI -->|"import"| CORE
    SERVER -->|"import"| CORE
    CLI -.->|"serve 命令动态加载"| SERVER
    WEB ===>"|HTTP /api/* 请求|" SERVER
    CORE -->|"读取 JSONL"| external
end
```

图中有三条关键信息，请务必记住，它们贯穿全文：**第一**，`core` 被 `cli` 和 `server` 共同依赖，是整个系统的地基；**第二**，`web` 是唯一不 import 任何 Node 端代码的层，它只通过 HTTP 与 `server` 通信；**第三**，`cli` 与 `server` 之间只有一条细弱的虚线连接——只有执行 `super-cli serve` 时才会动态加载服务端。这种"依赖只向下、不横向、不回头"的规则，是本仓库所有结构决策的出发点。

Sources: [AGENTS.md](AGENTS.md#L6-L12), [providers.ts](src/core/providers.ts#L15-L40)

## src/core：唯一的数据与业务核心层

先看这一层的家底。`src/core/` 下共 17 个 TypeScript 模块，全部是纯 Node.js 代码（只依赖 Node 内置模块和自身），不含任何 UI 框架、Web 框架或 CLI 框架的依赖：

```text
src/core/
├── types.ts              # 共享类型定义（CliProvider、SessionMetadata 等）
├── providers.ts          # Provider 注册表：Claude Code / Qoder / Codex
├── paths.ts              # 路径规则：各 CLI 数据目录布局与编码
├── session-reader.ts     # Claude Code / Qoder 的 JSONL 会话读取器
├── codex-reader.ts       # Codex 的会话读取器（异构数据源适配）
├── session-index.ts      # 全量会话内存索引（核心聚合模块）
├── session-search.ts     # 跨会话全文搜索
├── task-store.ts         # 标签/命名的持久化存储
├── config.ts             # ~/.super-cli/config.json 读写
├── skill-reader.ts       # Skills 配置读取
├── mcp-reader.ts         # MCP Servers 配置读写
├── rules-reader.ts       # Rules 文件读取与保存
├── hooks-reader.ts       # Hooks 配置读取
├── permissions-reader.ts # Permissions 配置读取
├── project-info.ts       # 项目元数据采集（Git / Node 版本）
├── project-archive.ts    # 项目归档与置顶
└── terminal-launcher.ts  # 终端启动适配（Ghostty / iTerm2 等）
```

按职责可以把这 17 个模块归成四组：

| 分组 | 模块 | 职责 |
|---|---|---|
| **基础设施** | `types.ts`、`providers.ts`、`paths.ts`、`config.ts` | 类型契约、Provider 注册表、路径规则、用户配置 |
| **会话读取** | `session-reader.ts`、`codex-reader.ts` | 解析各 Provider 落盘的 JSONL 会话文件 |
| **聚合与服务** | `session-index.ts`、`session-search.ts`、`task-store.ts` | 索引、搜索、标签——面向上层的能力输出 |
| **Harness 与集成** | `skill/mcp/rules/hooks/permissions-reader.ts`、`project-info.ts`、`project-archive.ts`、`terminal-launcher.ts` | 各 CLI 配置中心数据源与系统集成 |

对初学者而言，这一层最值得先记住的是**三个入口式模块**。`types.ts` 定义了全仓库共享的类型契约——`CliProvider` 联合类型限定了 provider 只能是 `'claude-code' | 'qoder' | 'codex'` 三个值之一，`SessionMetadata` 则规定了每条会话元数据长什么样，cli 和 server 层都从这里 import 类型。[providers.ts](src/core/providers.ts#L15-L40) 是一张静态注册表：每个 Provider 一条配置，含可执行命令、新建/恢复会话的参数、以及 `homeDir`（如 `~/.claude`）——`getAvailableProviders()` 甚至会用 `existsSync` 过滤掉本机未安装的 CLI，这让"支持三个 Provider"变成了一件事：在数组里加一项。而 [session-index.ts](src/core/session-index.ts#L9-L17) 是聚合中枢：它定义了 `ISessionReader` 接口（统一 `SessionReader` 与 `CodexReader` 两种异构读取器的抽象边界），上层只需要问它"给我所有会话"，完全不必关心底下是哪个 Provider 的哪种文件格式。

Sources: [types.ts](src/core/types.ts#L1-L53), [providers.ts](src/core/providers.ts#L15-L48), [session-index.ts](src/core/session-index.ts#L9-L17), [paths.ts](src/core/paths.ts#L1-L15), [config.ts](src/core/config.ts#L1-L12)

## src/cli：用户与 Agent 的命令行入口层

`src/cli/` 是整个工具对外的第一张脸——npm 包名 `super-cli` 对应的可执行文件（`bin` 字段指向 `dist/cli/index.js`）就从这里编译而来。它的结构极薄：一个入口文件、一个输出格式化工具、八个命令注册文件：

```text
src/cli/
├── index.ts        # 入口：创建 Commander 实例，注册全部子命令
├── output.ts       # 终端表格格式化 / --json 结构化输出
└── commands/       # 八个子命令，一命令一文件
    ├── list.ts     # super-cli list     — 列出会话
    ├── show.ts     # super-cli show     — 查看会话详情
    ├── search.ts   # super-cli search   — 全文搜索
    ├── name.ts     # super-cli name     — 会话命名/打标签
    ├── tasks.ts    # super-cli tasks    — 任务看板视图
    ├── stats.ts    # super-cli stats    — 使用统计
    ├── config.ts   # super-cli config   — 用户配置
    └── serve.ts    # super-cli serve    — 启动 Web 服务
```

这一层的设计哲学是**"薄壳"**：命令文件只做三件事——声明参数、调用 core、格式化输出。以 [list.ts](src/cli/commands/list.ts#L6-L31) 为例，`registerListCommand` 函数用 Commander 的链式 API 声明 `-p/--project`、`--json` 等选项，`action` 回调里实例化 `SessionIndex`、调用 `getAllSessions()`，最后把结果交给 `formatSessionList` 打印——全程不到 35 行，没有任何业务逻辑。所有命令都遵循同一个模式：**业务在 core，壳在 cli**。这意味着给 CLI 加一个新命令的成本极低，且新命令天然就能复用 core 的全部能力。

八条命令中有一个特殊的例外：`serve`。它不调用 core，而是通过 `await import('../../server/index.js')` **动态加载** server 层的 `startServer()` 启动 HTTP 服务（[serve.ts](src/cli/commands/serve.ts#L15-L16)）。用动态 import 而非顶部 import 的好处是：只有真正执行 `super-cli serve` 时才会加载 Fastify 及其依赖，执行 `super-cli list` 这类轻量命令时完全不背上 Web 服务器的开销。这条命令就是前文架构图中那条虚线的实体。

Sources: [package.json](package.json#L6-L8), [index.ts](src/cli/index.ts#L1-L29), [list.ts](src/cli/commands/list.ts#L2-L31), [serve.ts](src/cli/commands/serve.ts#L11-L18)

## src/server：把 core 能力暴露为 REST API

如果说 cli 层把 core 包装成"命令"，server 层就是把同一份 core 能力包装成"HTTP 接口"，供浏览器里的 React 前端消费。它的结构同样克制：一个服务启动文件加六个路由文件，与 cli 的八个命令形成清晰的对应关系：

```text
src/server/
├── index.ts           # startServer()：创建 Fastify 实例，装配所有路由
└── routes/
    ├── sessions.ts    # GET /api/sessions、会话详情、消息、搜索、恢复
    ├── tasks.ts       # 任务标签的增删改
    ├── stats.ts       # 使用统计
    ├── projects.ts    # 项目列表、详情、归档、置顶、终端打开
    ├── config.ts      # Skills / MCP / Rules / Hooks / Permissions 配置接口
    └── refresh.ts     # 缓存刷新
```

[index.ts](src/server/index.ts#L18-L48) 中的 `startServer()` 是这一层的全部装配逻辑，读一遍就能理解 server 的三个身份。**身份一：API 服务器**——创建 Fastify 实例、注册 CORS、实例化 `SessionIndex` 与 `TaskStore` 两个 core 对象，然后把它们注入六个 `register*Routes()` 函数；每个路由文件拿到的都是同一份共享实例，这与 cli 层"每次命令临时创建"的短生命周期形成对比（服务进程常驻，索引和缓存才有意义）。**身份二：静态资源服务器**——`startServer` 检查 `dist/web` 目录是否存在，若存在则通过 `@fastify/static` 托管，并把 404 处理器设置为返回 `index.html`，这正是单页应用（SPA）路由回退的标准做法。**身份三：连接点**——它是 web 层与 Node 端之间唯一的桥。

路由文件延续 cli 层的薄壳模式。以 [sessions.ts](src/server/routes/sessions.ts#L10-L33) 为例，`GET /api/sessions` 的处理函数解析查询参数、调用 `index.getAllSessions()`、用 `inferSessionStatus()` 补充状态字段后返回 JSON——HTTP 语义（状态码、参数解析）在这层，数据语义（过滤、排序、状态推断）在 core 层，边界干净。

Sources: [index.ts](src/server/index.ts#L18-L48), [sessions.ts](src/server/routes/sessions.ts#L7-L33)

## src/web：不认识 core 的 React SPA

第四层在观感上和前三层很不一样：`src/web/` 是一个自包含的 Vite 项目，有自己的 `index.html`、`vite.config.ts`、`tsconfig.json`，技术栈是 React 19 + TailwindCSS，而非 Node 端的 tsup + Fastify：

```text
src/web/
├── index.html          # SPA 入口 HTML
├── vite.config.ts      # Vite 配置（构建产物 → dist/web）
├── tsconfig.json       # 前端独立的 TS 配置
└── src/
    ├── main.tsx        # React 挂载点
    ├── App.tsx         # 任务模式主视图（看板/卡片/列表）
    ├── ConfigView.tsx  # Harness 配置模式视图
    ├── api/client.ts   # 唯一的 HTTP 客户端（fetch 封装）
    ├── pages/          # Dashboard / Sessions / Search / Tasks / SessionDetail
    ├── components/     # 预留目录（当前为空）
    └── hooks/          # 预留目录（当前为空）
```

这一层最重要的架构事实是：**web 不 import core、不 import server、不 import 任何 Node 端代码**。它与后端的全部联系浓缩在 [api/client.ts](src/web/src/api/client.ts#L1-L12) 这一个文件里——所有函数都是对 `fetch('/api/...')` 的薄封装，从 `fetchSessions` 到 `copyMcpServerApi` 共二十余个函数一一对应 server 层的路由。这种"HTTP 是唯一通道"的约束带来一个直接好处：前端跑在浏览器里，根本没有 Node 的 `fs` 可用，物理上就无法绕过 server 直读磁盘，架构约束被运行时环境天然强制了。

视图组织上，[App.tsx](src/web/src/App.tsx#L110-L115) 通过 `appMode` 状态在 `task`（任务模式）与 `config`（配置模式，即 `ConfigView`）之间切换，并把模式、选中的 provider、项目、视图等状态同步进 URL 查询参数，保证刷新后视图可恢复。顺带说明：`components/` 与 `hooks/` 两个目录目前是空的预留位，主要 UI 逻辑集中在 `App.tsx`（约 1285 行）与 `ConfigView.tsx`（约 1019 行）两个大文件中——浏览目录树时不要在这两个空目录里找代码。开发期，[vite.config.ts](src/web/vite.config.ts#L12-L16) 配置了 `/api` 代理到 `localhost:3000`，所以 `pnpm dev:web` + `pnpm dev` 同时跑起来时，前端的热更新开发与后端 API 无缝协作。

Sources: [vite.config.ts](src/web/vite.config.ts#L5-L16), [client.ts](src/web/src/api/client.ts#L1-L12), [main.tsx](src/web/src/main.tsx#L1-L11), [App.tsx](src/web/src/App.tsx#L110-L115)

## 依赖规则：一条不允许反向的链

现在把四层放在一起，回答一个初学者最常问的问题："为什么 core 里的代码不能反过来调用 cli 或 server？"答案藏在下面的依赖矩阵里——本仓库的 import 关系形成一条**严格单向的链**：

| 模块 | 可以 import 谁 | 禁止 import 谁 | 原因 |
|---|---|---|---|
| `core` | 仅 Node 内置模块与自身 | cli、server、web | 它是最底层，若依赖上层会形成循环 |
| `cli` | core、（动态）server | web | 命令行场景用不到浏览器代码 |
| `server` | core | cli、web | 服务进程不经过命令行入口 |
| `web` | 自身（React 生态） | core、cli、server（仅 HTTP 通信） | 浏览器无 Node API，物理隔离 |

这条单向链的价值可以从一次具体的验证中看出：通过检索全部 import 语句可以确认，`src/cli/commands/` 下的八个文件无一例外地 import `../../core/*`，`src/server/routes/` 下的六个文件同样只 import `../../core/*`——**cli 和 server 是平级的两扇门，打开后走进的是同一个房间（core）**。这就是为什么 `super-cli list` 命令行输出和 `/api/sessions` 接口返回的数据永远一致：它们调用的是同一份索引、同一套过滤逻辑、同一组类型定义（`core/types.ts`）。假设 core 反向依赖了 cli 的输出格式化，那么 server 就被迫拖入 chalk/cli-table3 这些终端库——依赖污染会像多米诺一样扩散。

对分层的一个直观检验方式：换掉 web 层（比如改用 Vue 重写前端），core/cli/server 一行不用改；换掉 cli 层（比如改成图形化启动器），core 依旧岿然不动。**每一层的可替换性，就是分层正确性的证明。**

Sources: [index.ts](src/cli/index.ts#L3-L10), [list.ts](src/cli/commands/list.ts#L2-L4), [sessions.ts](src/server/routes/sessions.ts#L2-L5), [projects.ts](src/server/routes/projects.ts#L5-L10)

## 构建与运行视角：四层如何汇成一个发布物

分层的最后一块拼图在构建系统。本仓库采用**双构建流水线**：[tsup.config.ts](tsup.config.ts#L4-L16) 声明了两个 Node 端入口（`cli/index` 与 `server/index`），以 ESM 格式、`splitting: true` 编译到 `dist/`——代码分割会让 core 这种被两个入口共享的依赖打包成公共 chunk，避免逻辑重复；而 web 层则由 [Vite](src/web/vite.config.ts#L8-L11) 独立构建到 `dist/web/`。`pnpm build` 串联两者（`build:cli` + `build:web`），最终 `dist/` 下出现三个产物目录：`dist/cli`、`dist/server`、`dist/web`——恰好一一对应三个 Node 端层加一个前端层。

运行时的闭环由此形成，一次 `super-cli serve` 的完整链路是：

1. npm `bin` 入口执行 `dist/cli/index.js`，Commander 解析出 `serve` 子命令；
2. `serve` 动态加载 `dist/server/index.js` 的 `startServer()`，Fastify 在 3000 端口启动；
3. 浏览器访问后，`@fastify/static` 从 `dist/web/` 返回 `index.html` 与静态资源；
4. React SPA 加载后通过 `api/client.ts` 发起 `/api/*` 请求；
5. Fastify 路由调用 `dist` 中打包的 core 逻辑，读取 `~/.claude` 等目录下的 JSONL 文件并返回 JSON。

一个工具，两种使用姿势（CLI 直接跑、浏览器里看），四层各司其职——这就是分层的最终回报：[package.json](package.json#L9-L17) 的 `files` 字段只需发布一个 `dist/` 目录，用户 `npm install` 后即得到完整功能，无需额外的前端部署步骤。

Sources: [tsup.config.ts](tsup.config.ts#L4-L16), [package.json](package.json#L26-L36), [index.ts](src/server/index.ts#L33-L44), [AGENTS.md](AGENTS.md#L31-L40)

## 四层职责速查表

最后用一张总表固化本页内容，建议初学者在动手改代码前对照此表定位目标层：

| 维度 | `src/core` | `src/cli` | `src/server` | `src/web` |
|---|---|---|---|---|
| **一句话职责** | 读磁盘数据 + 全部业务逻辑 | 命令解析 + 终端输出 | HTTP API + 静态资源托管 | 浏览器 UI |
| **核心技术** | 纯 TypeScript + Node 内置模块 | Commander.js、chalk、cli-table3 | Fastify 5、@fastify/static | React 19、Vite、TailwindCSS |
| **文件规模** | 17 个模块，约 2000 行 | 10 个文件，约 520 行 | 7 个文件，约 630 行 | 9+ 个文件，约 3000 行 |
| **依赖对象** | 无（仅 Node 内置） | core、动态加载 server | core | 无（仅 HTTP 调用 server） |
| **构建工具** | tsup（随入口打包） | tsup → `dist/cli` | tsup → `dist/server` | Vite → `dist/web` |
| **典型入口** | 类/函数被上层调用 | `super-cli <command>` | `startServer()` | 浏览器加载 `index.html` |
| **改代码的典型场景** | 支持新 Provider、改过滤逻辑 | 加新命令、改输出格式 | 加新 API、改路由 | 改界面、加视图 |

## 下一步阅读

本页建立了四层的空间地图，接下来建议按"由内向外"的顺序深入：先吃透地基——[多 Provider 架构：Claude Code、Qoder、Codex 的注册表设计](5-duo-provider-jia-gou-claude-code-qoder-codex-de-zhu-ce-biao-she-ji)与 [SessionIndex 全量内存索引与 TTL 缓存策略](8-sessionindex-quan-liang-nei-cun-suo-yin-yu-ttl-huan-cun-ce-lue)是 core 层的两块基石；然后分别从两扇门向外看——CLI 侧读 [Commander.js 子命令注册模式与全局 --provider 过滤](12-commander-js-zi-ming-ling-zhu-ce-mo-shi-yu-quan-ju-provider-guo-lu)，HTTP 侧读 [Fastify 5 REST API 参考：sessions / tasks / stats / projects / config / refresh](14-fastify-5-rest-api-can-kao-sessions-tasks-stats-projects-config-refresh)；最后补齐两端的"连接件"——[单进程全栈部署：Fastify 托管 React 静态资源与 SPA 回退](15-dan-jin-cheng-quan-zhan-bu-shu-fastify-tuo-guan-react-jing-tai-zi-yuan-yu-spa-hui-tui)解释 server 与 web 如何合体，[双构建流水线：tsup 打包 Node 端与 Vite 打包前端 SPA](23-shuang-gou-jian-liu-shui-xian-tsup-da-bao-node-duan-yu-vite-da-bao-qian-duan-spa)则从工程视角复盘本页末尾的构建内容。