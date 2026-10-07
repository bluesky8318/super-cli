# 需求文档：想法（Idea）、任务（Task）与 Agent 执行

> Status: Draft v2
> Date: 2026-06-09
> 调研对象：[hAcKlyc/MyAgents](https://github.com/hAcKlyc/MyAgents)（任务中心模式）
> v2 变更：移除自动调度（定时/周期不在本期范围）；明确想法/任务/Session 三个概念；新增 Agent 执行配置。

---

## 1. 三个核心概念的定义与边界

这是本期最重要的交付：先把概念讲清楚，再谈功能。

### 1.1 概念定义

| 概念 | 定义 | 它不是什么 |
|---|---|---|
| **Idea（想法）** | 未成形的工作线索。低门槛记录一句话、一个灵感、一个待办。支持标签、归档、搜索。**不会被执行，没有状态机**（只有 archived）。 | 不是任务，不强制要求验收标准，不参与看板 |
| **Task（任务）** | 成形的工作项。有状态机、有目标描述、可绑定多个 session、**可指定 Agent 执行**。承载实体 = 现有 Issue（产品线统一叫"任务"）。 | 不是 session 的标签，不是调度器里的 cron 条目 |
| **Session（会话）** | 某个 provider CLI 的一次对话，是 Task 的**执行载体和审计轨迹**。session 独立存在于各 provider 目录（super-cli 只读索引），可以不属于任何 Task。 | 不是任务本身；session 的命名/标签（TaskLabel）只是元数据，不构成任务 |

### 1.2 概念关系

```text
Idea ──promote──▶ Task ──run(指定Agent)──▶ spawn headless CLI ──▶ Session
 │                   │                                              │
 └─ 可独立存在        └──bind◀───────────────────────────────────────┘
     不执行            一个 Task 可绑定多个 Session（多轮执行、跨 provider）
                      一个 Session 也可以不属于任何 Task
```

- **Idea → Task 是单向转化**：promote 后源 Idea 保留并回写 `promotedIssueId`，删除 Idea 不级联删除 Task（借鉴 MyAgents Record 语义）。
- **Task → Session 是引用关系**：session 文件归 provider 所有，Task 只存 sessionId 引用；session 被删不影响 Task 存在（溯源链断裂但任务状态不受损）。
- **TaskLabel（现有 session 命名/标签）保持现状**，与 Task 正交——它回答"这个 session 叫什么"，Task 回答"要做什么工作"。

### 1.3 Task 的来源与执行

Task 的三个来源：

1. 用户直接创建（CLI / Web）
2. Idea promote
3. Agent 通过 `super-cli issue create` 创建（已有能力）

Task 的执行方式（本期**只有手动触发**，无调度器）：

```bash
super-cli issue run <id> --agent <agentName>
```

= 用指定 AgentProfile 以 **headless 模式**启动 CLI → 执行产物天然落在 provider 的 session 目录 → 自动 bind 到 Task → 写 Run 记录 → 看板可溯源。同一个 AgentProfile 用 **interactive 模式**启动就是"新建会话"——两种模式的关系见 §2.1。

---

## 2. 新增实体：Agent（Agent 启动配置档案）

现状问题：界面上现有的"新建任务"按钮，实际是选 provider → 打开终端窗口跑交互式 CLI——**这本质是"新建会话"**，不是任务（任务是异步的）。而这套路启动配置（provider、工作目录、启动参数）目前硬编码在 `providers.ts`（如 claude 的 `newArgs: ['--dangerously-skip-permissions']`），用户不可配。

因此 AgentProfile 不是只为无头执行服务的新概念，而是把**"如何启动一个 agent CLI"这个已有但硬编码的概念显式化、可配置化**：一个实体，两种启动模式。

### 2.1 两种启动模式

| 模式 | 入口 | 形态 | 产物 |
|---|---|---|---|
| `interactive` 交互 | Web "新建会话"按钮（原"新建任务"改名） | terminal-launcher 打开终端窗口，人参与 | session |
| `headless` 无头 | Task 的 `run`（CLI / Web） | 后台 spawn 子进程，异步执行 | session + Run 记录 + 自动 bind 到 Task |

两种模式消费**同一份 AgentProfile**，只是 spawn 路径不同：interactive 走 `terminal-launcher`（macOS 终端 App 集成），headless 走直接子进程 + 输出捕获。

### 2.2 数据模型

存储：`~/.super-cli/agents.json`

```typescript
type AgentProvider = 'claude-code' | 'codex' | 'pi';  // headless 本期只支持这三个

type AgentCapabilities = {
  interactive: boolean;   // 可打开终端窗口（所有 provider 都支持）
  headless: boolean;      // 可无头执行（本期仅 claude-code / codex / pi）
};

interface AgentProfile {
  id: string;                    // 短 id，如 'agt-1'
  name: string;                  // 用户可读名，如 'claude-默认'、'codex-只读评审'
  provider: CliProvider;         // interactive 模式不限；headless 限定上述三家
  model?: string;                // claude: --model；codex: -c model=...；pi: --model
  workingDir?: string;           // 缺省 = 当前项目路径 / Task 归属项目的解码路径
  extraArgs?: string[];          // 追加给 CLI 的原始参数（逃生舱），覆盖 providers.ts 硬编码默认值
  env?: Record<string, string>;  // 额外环境变量
  builtin?: boolean;             // 内置 profile（每个已安装 provider 一个），不可删除只可改
  createdAt: string;
  updatedAt: string;
}
```

**内置 profile**：首次启动为每个已安装 provider 生成一个 builtin profile（参数取 `providers.ts` 现有硬编码值），现有"新建会话"行为零变化；用户随后可改参数、可新增 profile（如"claude-只读"、"codex-full-auto"）。

### 2.4 无头模式调用方式（已逐一验证）

| Provider | 无头命令 | session 续接 | session id 获取 |
|---|---|---|---|
| claude-code | `claude -p "<prompt>" --output-format json` | `--resume <id>` | JSON 输出含 session_id |
| codex | `codex exec "<prompt>"` | `codex exec resume <id>` | 执行输出/JSONL 落盘后可索引 |
| pi | `pi --mode json "<prompt>"`（或 `--print`） | `--session <id>` | 可用 `--session-id <id>` **指定** id，绑定最可靠 |

权限模式不进 AgentProfile 的一等字段，由各 profile 的 `extraArgs` 承载（如 claude 的 `--permission-mode`、codex 的 `--full-auto`、pi 的 `--tools`），避免为三个 CLI 设计抽象的最小公约数权限模型。

### 2.5 管理入口

```bash
super-cli agent list [--json]
super-cli agent add --name <n> --provider <p> [--model m] [--dir d] [--arg ...] [--json]
super-cli agent show <id> [--json]
super-cli agent edit <id> [--name] [--model] [--arg ...]
super-cli agent remove <id>          # builtin 不可删
```

Web：设置页新增"Agent"管理区（列表 + 新建/编辑表单 + 删除确认）。**"新建会话"按钮的下拉项从"provider 列表"改为"AgentProfile 列表"**（默认收起为各 provider 的 builtin profile）。

### 2.6 文案与概念修正

| 现状 | 改为 | 理由 |
|---|---|---|
| 工具栏"新建任务"按钮 | **"新建会话"** | 它打开的是交互式 agent 终端，同步、人在场 |
| 工具栏"新建 Issue"按钮 | **"新建任务"** | Issue 即产品线的任务实体，用户面向统一叫任务 |
| 页面标题"全部任务"（session 列表） | "全部会话" | 该列表内容是 session |
| CLI `issue` 命令族 | 保留，加 `super-cli task` 别名 | 存储层不动，降低迁移成本 |

---

## 3. 新增实体：Idea（想法）

### 3.1 数据模型

存储：`~/.super-cli/ideas.json`

```typescript
interface Idea {
  id: string;               // IDEA-1 独立编号，递增
  content: string;          // 正文（Markdown）
  tags: string[];           // 支持正文内 #标签 解析
  projectEncoded?: string;  // 可选归属项目；允许全局想法
  promotedIssueId?: string; // promote 后回写，源 Idea 保留
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}
```

### 3.2 CLI

```bash
super-cli idea add "<content>" [--tag t] [--project] [--json]
super-cli idea list [--tag] [--archived] [--json]
super-cli idea show <id> [--json]
super-cli idea edit <id> [--content] [--tag] [--untag]
super-cli idea archive <id> / restore <id> / delete <id>
super-cli idea promote <id> [--priority] [--label] [--agent <name>] [--json]
```

`promote`：以 Idea 正文为 description 创建 Task（默认 `backlog`），可同时指定默认执行 Agent。

### 3.3 Web

任务中心页面改为双栏（借鉴 MyAgents Task Center）：左栏"想法"（输入框 + 标签筛选 + 列表 + promote 按钮），右栏任务看板/列表。SSE 实时刷新。

---

## 4. Task 扩展：手动执行（Run）

在现有 Issue 模型上扩展，**不加调度字段**。

### 4.1 字段扩展

```typescript
interface Issue {
  // …现有字段不变…
  defaultAgentId?: string;   // 默认执行 Agent（promote 或手动指定）
  lastRunAt?: string;
  runCount: number;
}
```

### 4.2 Run 记录（审计投影）

`~/.super-cli/runs/<issueId>.jsonl`，仅作查询/审计，不是权威状态：

```typescript
interface IssueRun {
  id: string;
  issueId: string;
  agentId: string;
  provider: AgentProvider;
  trigger: 'manual';        // 本期只有手动；为将来调度预留枚举
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'failed' | 'stopped';
  sessionId?: string;       // 执行产生/复用的 session，成功后自动 bind 到 issue
  exitCode?: number;
  error?: string;
}
```

### 4.3 执行流程

```text
super-cli issue run ISSUE-3 --agent claude-默认
  ├─ 校验：issue 存在、未归档、状态可执行（todo/in_progress/blocked）
  ├─ 解析 AgentProfile → 组装无头命令
  │    工作目录 = agent.workingDir ?? issue 项目解码路径（目录不存在则失败）
  │    prompt   = issue.prompt 字段（P1 用 title + description 拼接模板）
  ├─ spawn 子进程，stdout/stderr 流式透传 + 落 run 记录
  ├─ 提取/接收 sessionId → super-cli issue bind（自动）
  └─ 结束：写 finishedAt/exitCode/status
       exit 0 → 评论一条 agent 执行摘要，状态不动（由 agent 自己按 issue 工作流移动，或用户决定）
       非 0  → 评论失败原因，状态不动
```

设计要点：

- **run 不自动改看板状态**：执行完成 ≠ 验收通过，`done` 仍只能由用户移动（延续 `docs/issue-workflow.md` 纪律）。agent 在无头执行中可自己调用 `super-cli issue` 命令推进状态（工作目录下有 CLI 即可）。
- **串行约束**：同一 issue 同一时间只允许一个 running run，重叠触发直接拒绝。
- **前台/后台**：`issue run` 默认前台流式输出（CLI 场景）；`--detach` 后台执行 + SSE 推送进度（serve/Web 场景）。
- **Web 触发**：任务详情页"运行"按钮 → 选择 Agent → `POST /api/issues/:id/runs` → serve 端 spawn，SSE 广播 run 事件。

### 4.4 CLI 一览

```bash
super-cli issue run <id> [--agent <name>] [--detach] [--json]
super-cli issue runs <id> [--json]          # 执行历史
super-cli issue stop <id>                   # 终止进行中的 run
```

---

## 5. 功能需求清单

### P0 — Idea + Agent 配置

| # | 需求 | 验收 |
|---|---|---|
| F1 | `idea` 全套 CLI（add/list/show/edit/archive/restore/delete/promote） | ideas.json 落库，`--json` 完整 |
| F2 | `agent` 全套 CLI（list/add/show/edit/remove）+ 内置 profile 初始化 | agents.json 落库；首次启动生成 builtin profile，现有"新建会话"行为不变 |
| F3 | REST：`/api/ideas/*`、`/api/agents/*` | 与 CLI 同语义 |
| F4 | Web：任务中心双栏（想法 + 任务）；设置页 Agent 管理 | SSE 刷新 |

### P1 — Task 手动执行

| # | 需求 | 验收 |
|---|---|---|
| F5 | `issue run/runs/stop`，三个 provider 无头 spawn | 三家各跑通一个真实任务 |
| F6 | sessionId 捕获 + 自动 bind + Run 投影落盘 | `issue show` 可见绑定 session，`issue runs` 有记录 |
| F7 | Web：任务详情"运行"入口 + run 历史列表 | SSE 推送 run 状态 |
| F8 | skill 文档更新：agent 工作流补充 run 语义 | `super-cli skill install` 同步 |

### 明确不做（本期）

- ❌ 定时/周期调度（At/Every/Cron）、调度器、常驻化
- ❌ 条件激活 Detector（quiet/activate）
- ❌ Goal Mode（依赖 runtime 宿主控制，super-cli 不托管 runtime）
- ❌ qoder/kimi/opencode 等其余 provider 的执行支持（保留只读索引能力）
- ❌ Idea 的 AI 讨论式转化（P2 再评估）

---

## 6. 非功能需求

- **存储纪律**：只读 provider 目录；写仅 `~/.super-cli/` 下新增 `ideas.json`、`agents.json`、`runs/`。Issue 字段扩展向后兼容。
- **并发**：同一 issue 的 run 串行；issue-store 乐观锁纪律不变。
- **安全**：headless 执行的权限模式由用户在 AgentProfile 的 `extraArgs` 中**显式**配置，super-cli 不隐式提权；`env` 不进日志和 API 响应（Web 展示脱敏）。
- **可观测**：run 投影 + SSE 事件 + 执行命令行回显三件套。

---

## 7. 开放问题

1. ~~**Q1 命名**~~ 已决策（§2.6）：界面"新建任务"→"新建会话"，"新建 Issue"→"新建任务"；CLI 存储层沿用 `issue`，加 `super-cli task` 别名。
2. **Q2 prompt 模板**：run 时给 agent 的首轮 prompt，用固定模板（title + description + 最近 N 条评论）还是支持 per-issue 自定义 `prompt` 字段？（建议：P1 固定模板 + per-issue 可选覆盖）
3. **Q3 run 完成后的状态**：维持"状态完全由 agent/用户推进"，还是 run 成功自动 `todo → in_progress`？（建议：run 启动时若状态为 todo 则自动移 in_progress，与 claim 语义对齐）
4. **Q4 Idea 编号**：`IDEA-n` 独立编号（建议），还是与 issue 共享编号空间？
5. **Q5 detach 模式的生命周期**：CLI 退出后后台 run 是否继续？（建议：detach 的 run 由 spawn 方拥有——CLI detach 则进程脱离但 super-cli 不再管理，只有 serve 发起的 run 可被 stop）
