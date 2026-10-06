# super-cli

AI 编程助手 session 管理工具。统一管理 Claude Code、Qoder、Codex、Kimi CLI、Pi、OpenCode、WorkBuddy 和 TraeCode 的历史对话，支持命令行和 Web 看板两种交互方式。

## 功能

**Session 管理**
- 列出、查看、搜索所有历史 session，支持按项目、时间、分支、模型过滤
- 跨 session 全文搜索，命中结果高亮显示
- 通过 session ID 前缀快速定位，无需输入完整 ID

**任务看板**
- 给 session 命名/打标签，视为独立任务管理
- Issue 看板（7 状态列：需求池 / 待办 / 进行中 / 待复查 / 阻塞 / 已完成 / 已取消），拖拽改状态
- Issue 支持优先级、标签、Markdown 描述、评论、父子/阻塞/关联关系
- Issue 可绑定多个不同 provider 的 session，卡片上直接看到执行会话
- 乐观锁（version）保证多 agent 并发操作安全，SSE 实时推送变更
- 卡片视图、列表视图，按时间或消息量排序
- 按日期分组（今天 / 昨天 / 本周 / 更早）

**项目管理**
- 左侧项目导航，支持置顶、归档、展开/折叠
- 右键菜单：在 Finder 中打开、在终端中打开、查看详情
- 项目详情浮层：元数据展示 + 操作按钮 + 文件浏览器
- 新建任务时可选择 CLI 工具（Claude Code / Qoder / Codex / Kimi CLI / Pi / OpenCode / WorkBuddy / TraeCode）

**文件浏览器**
- 在项目详情浮层中浏览项目文件（只读）
- 左侧文件树 + 右侧文件预览，按需加载
- 代码文件语法高亮（Prism.js，支持 TypeScript/JSON/CSS/Python 等 20+ 种语言）
- Markdown 文件渲染为富文本预览
- 自动过滤 `.git`、`node_modules`、`dist` 等目录

**Harness 配置查看**
- 查看和管理各 provider 的 Skills、MCP Servers、Rules、Hooks、Permissions
- 支持跨 provider 复制 Skill 和 MCP Server 配置
- 查看和编辑 Rule 文件内容

**数据统计**
- 总 session 数、消息数、token 用量统计
- 按模型、按项目、按日期的使用分布
- `--json` 结构化输出，方便 agent 和脚本消费

**终端集成**
- 一键在终端中恢复 session（支持 Ghostty、iTerm2、Terminal.app、Kitty、Warp）
- 在终端中打开项目目录

## 安装

```bash
npm install -g @bluesky8318/super-cli
```

或本地开发：

```bash
pnpm install
pnpm build
pnpm link --global
```

## 使用

### CLI

```bash
# 列出最近 session
super-cli list

# 按项目、时间过滤
super-cli list --project /path/to/project --since 2024-01-01

# 查看 session 详情（支持 ID 前缀匹配）
super-cli show abc123
super-cli show abc123 --messages   # 查看对话记录
super-cli show abc123 --tools      # 查看工具调用统计

# 全文搜索
super-cli search "error handling" --project my-project --max 20

# 给 session 命名和打标签
super-cli name abc123 "重构认证模块"
super-cli name abc123 --tag backend
super-cli name abc123 --untag backend
super-cli name abc123 --remove

# 查看已命名的任务
super-cli tasks
super-cli tasks --tag backend

# Issue 看板（agent-friendly，写操作支持 --if-version 乐观锁）
super-cli issue list --status todo --json
super-cli issue create --title "实现登录页" --priority high --label 前端
super-cli issue show ISSUE-3 --comments --activity
super-cli issue move ISSUE-3 in_progress --if-version 2
super-cli issue claim ISSUE-3 --session-id abc123   # agent 一步认领：todo→in_progress + 绑定会话
super-cli issue comment ISSUE-3 --add "已完成，待验收" --agent --session-id abc123
super-cli issue bind ISSUE-3 abc123   # 绑定执行会话
super-cli issue relate ISSUE-3 blocks ISSUE-5

# 把 super-cli-taskboard skill 安装到各 agent（模拟 `npx skills` 交互式选择，-y 跳过）
super-cli skill list                    # 查看各 agent 的安装状态
super-cli skill install                 # 交互式选择 agent
super-cli skill install -y              # 全部检测到的 agent，免交互
super-cli skill install --agent claude-code,kimi --project   # 装到当前项目
super-cli skill uninstall -y

# 使用统计
super-cli stats --model --daily

# 配置管理
super-cli config show
super-cli config set terminal ghostty
super-cli config get terminal
super-cli config path
```

所有命令支持 `--json` 输出，方便集成到 agent 工作流。

全局 `--provider` 参数可过滤特定 CLI 工具（如 `claude-code`, `qoder`, `codex`, `kimi`, `pi`, `opencode`, `workbuddy`, `traecode`）：

```bash
super-cli --provider claude-code list
super-cli --provider qoder search "query"
```

### Web Dashboard

```bash
super-cli serve --port 3000 --open
```

Web 界面提供：
- **侧边栏导航** — 任务 / Harness 双模式切换，项目列表支持右键菜单
- **三种视图** — 看板视图（按状态分列）、卡片视图、列表视图
- **项目详情** — 元数据、操作按钮、文件浏览器（语法高亮 + Markdown 渲染）
- **工具栏** — 强制刷新缓存、排序、视图切换、Provider 过滤
- **多主题** — 亮色 / 暗色 / 深蓝三种主题

点击 session 卡片可展开右侧详情面板，查看对话记录、元数据，并一键在终端中恢复会话。

## 技术栈

| 层 | 技术 |
|---|---|
| CLI | Commander.js |
| HTTP 服务器 | Fastify 5 |
| 前端 | React 19 + Vite + TailwindCSS 4 |
| 语法高亮 | Prism.js |
| Markdown 渲染 | marked |
| 构建 | tsup (CLI/Server) + Vite (Web) |
| 测试 | Vitest |
| 运行时 | Node.js >= 22 |
| 模块系统 | ESM |

## 开发

```bash
pnpm dev          # CLI/Server 热重载（tsup --watch）
pnpm dev:web      # 前端开发服务器（自动代理 /api 到 localhost:3000）
pnpm test         # 运行测试
pnpm typecheck    # TypeScript 类型检查
pnpm build        # 完整构建
pnpm start        # 运行构建产物
```

## 数据存储

不依赖数据库，直接读取各 CLI 工具的本地数据：

| 来源 | 路径 |
|---|---|
| Claude Code sessions | `~/.claude/projects/<编码路径>/<uuid>.jsonl` |
| Qoder sessions | `~/.qoder/projects/<编码路径>/<uuid>.jsonl` |
| Codex sessions | `~/.codex/sessions/` |
| 用户标签/命名 | `~/.super-cli/config.json` |
| Issue 看板数据 | `~/.super-cli/issues.json` |

Agent 使用 issue 看板的工作流纪律见 [docs/issue-workflow.md](docs/issue-workflow.md)。

## License

Apache-2.0
