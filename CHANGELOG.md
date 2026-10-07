# Changelog

本文件记录 super-cli 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [Unreleased]

### Fixed
- 任务/会话详情面板改为右侧 fixed 浮层（与项目详情面板一致），不再挤占看板布局；拖拽手柄跟随面板左缘
- 修复 headless 运行的工作目录解析：dash 编码对含 `-` 的目录名是有损的（super-cli → super/cli），新增 `resolveIssueProjectPath` 依次尝试绝对路径→直接解码→session 索引 aliases 兜底；想法转任务直接存 decoded 绝对路径（项目身份新规范）
- 任务运行 Agent 选择器语义明确：有默认 Agent 显示「默认：xxx」，没有则必须显式选择才能运行（按钮禁用 + 提示）
- 移除「任务默认 Agent」概念（`defaultAgentId` 字段及 CLI `issue update --agent` 一并移除）：运行任务必须显式选择 Agent
- 会话与任务绑定关系排他：一个会话只能绑定一个任务（重复绑定自动从旧任务解绑），一个任务可绑定多个会话
- **任务页「任务 | 会话」页签分离**：两个页签视角对称——任务页签主体是任务（任务下挂会话），会话页签主体是会话（会话卡片显示归属任务徽标，未绑定的按规则虚拟临时任务=会话标题，不落库）；均有看板/卡片/列表三视图 + 排序（任务为最近/最早/评论最多，会话为最近/最早/消息最多）+ 按日期分组 + 工具筛选（任务按绑定会话的 provider 归属，无绑定会话的任务始终显示）
- 任务/会话详情合并为同一右侧浮层面板：任务详情内「运行」并入「关联会话」页签（运行的产出就是会话）；会话详情顶部显示归属任务块（真实任务可跳转，未绑定显示虚拟任务）
- 想法卡片/详情中的任务 ID 可点击跳转到对应项目的任务界面；想法详情完整展示关联任务（ID/标题/状态/归属项目）
- 想法不再跟随侧边栏项目选择（想法有自己的分类/项目/时间筛选器）
- 任务强制归属项目：新建任务必须选择项目（可检索选择器，同想法转任务），服务端/CLI（`--project` 必填）双重校验；ISSUE-13 等无项目存量数据已补归属
- 想法卡片显示归属项目徽标；想法详情重构信息层级（标题+状态 / 元信息行 / 原始记录 / 已转任务金色横幅可点击 / 评论 / 文档路径）
- 修复切换项目时任务列表慢一拍的 bug：project effect 经 ref 间接调用了上一帧的 loadIssues 闭包，改为直接调用当前渲染的函数
- 修复任务项目身份不一致：issue 查询/创建统一使用 decoded 绝对路径（消除 dash 编码的双写问题），issue-store 过滤对存量 dash 数据做归一化兼容；切换项目时任务列表正确重新加载


### 新增

- **想法（Idea）v2**：生命周期 `draft（待分类）→ incubating（孵化中）→ promoted（已转任务）/ abandoned（已放弃，保留）`；顶部一句话输入框即记录；分类后落到分类项目 `00-Inbox/Idea/<yyyy>/<yyyy>-<mm>/<时间戳>-<id>.md`（md 为唯一事实源，agent 可直接按 frontmatter+段落格式编辑，系统能读回）；评论/修正追加进 md（原始记录不变）；成熟后「转为任务」新建 Issue（md 为原始需求文档，任务状态回显卡片；归属项目从当前全量项目中检索选择，默认分类项目）；未分类不能评论/转任务。放弃/归档两种结束状态**都可恢复**（已分类的回孵化中，未分类的回待分类）；不可删除；已转任务的只能归档。想法页为五列卡片盒看板（待分类｜孵化中｜已转任务｜已放弃｜已归档），支持分类/项目/时间筛选；记录入口为**全局悬浮按钮**（右下角 💡，任意页面可记录，⌘/Ctrl+Enter 保存，保存后想法页自动刷新）。分类（名称→项目路径）在系统配置 `settings.ideaCategories` 维护，内置默认：个人→`personal-notes`、工作→`work-notes`。CLI：`idea add|list|show|categorize|categories|comment|promote|abandon|restore|delete`
- **Agent 启动配置**：`super-cli agent list/add/show/edit/remove`，统一管理 agent CLI 启动参数（provider/model/工作目录/额外参数/环境变量）；首次启动自动为每个 provider 生成内置 profile；存储于 `~/.super-cli/agents.json`
- **任务无头执行（issue run）**：`super-cli issue run <id> --agent <name>` 以后台无头模式执行任务（支持 Claude Code / Codex / Pi），自动绑定产出 session、写执行记录（`~/.super-cli/runs/`）；`issue runs` 查看历史，`issue stop` 停止；run 启动时 todo 自动移入 in_progress
- **CLI 别名**：`super-cli task` 作为 `super-cli issue` 的别名
- **个人微信看板**：灵感板块下的独立功能（不接项目/任务/想法），复用本机 wx-cli server 的只读 HTTP API（timeline/messages/search），提供每日消息看板：统计卡（消息/活跃会话/@我/链接/我发出的）、24 小时时段分布、活跃会话排行、@我消息、链接情报、活跃人物、单群日报（Markdown 可复制）；wx-cli 地址/令牌/我的名字在系统配置中可配
- **REST API**：`/api/ideas/*`、`/api/agents/*`、`/api/issues/:id/runs*`；`/api/sessions/new` 支持 `agentId` 参数；SSE 新增 `idea.*`、`agent.*`、`run.*` 事件

### 变更

- **项目文件浏览增强**：文件树支持在浏览器新标签打开原始文件（`/api/projects/:encoded/files/raw/<path>` 路径式 URL，兼容 docu.md 等浏览器插件的扩展名检测）；「打开目录」更名为「在{文件管理器}中打开」，应用可在系统配置中设置（`settings.fileManager`，mac `open -a` / Win `explorer` / Linux `xdg-open`）
- **项目详情面板**：从模态弹窗迁移为任务页最右侧固定浮层，跟随选中项目，可拖拽调宽（默认 1/2 屏宽），含详情/文件两个页签
- **性能**：session 索引并发构建去重（in-flight 共享）+ serve 启动即预热，首次打开从 ~3.3s 降至 ~0.1s
- **Provider 存储布局适配**：Kimi（`sessions/<md5>/<uuid>/context.jsonl`）、Pi（`agent/sessions/--enc--/<ts>_<uuid>.jsonl`）、WorkBuddy（无前缀 dash 编码）的 session 现在能被正确索引、筛选和查看；provider 注册表新增 `sessionLayout` 声明，`SessionReader` 统一规范化消息格式
- **项目跨 provider 合并**：同一项目在不同 provider 下的 session 聚合为一行；项目身份改为解码后的绝对路径（旧的编码 id 通过 `aliases` 兼容匹配置顶/归档）
- **Web 文案**：工具栏“新建任务”（打开终端窗口）更名为“新建会话”，下拉项从 provider 列表改为 Agent profile 列表；“新建 Issue”更名为“新建任务”；会话列表页标题改为“全部会话”
- **Web**：侧边栏新增“想法”视图（记录/归档/转为任务）；任务详情新增“运行”页签（选择 Agent、启动/停止、执行历史）；Harness 配置页新增 Agents 管理

## [0.1.0] - 2026-05-31

### 新增

- **Session 索引与搜索**：读取 `~/.claude/`、`~/.qoder/`、`~/.codex/` 下的 JSONL 文件，列出、查看、搜索所有历史 session
- **多 Provider 支持**：支持 Claude Code、Qoder、Codex 三个 provider
- **任务看板**：给 session 命名/打标签，看板/卡片/列表三种视图
- **CLI 模式**：`list`/`show`/`search`/`name`/`tasks`/`stats`/`serve`/`config` 子命令，支持 `--json` 输出
- **Web 模式**：Fastify HTTP 服务 + React SPA，浏览器中查看 Dashboard、会话详情、搜索
- **终端集成**：一键恢复 session（支持 Ghostty、iTerm2、Terminal.app、Kitty、Warp）
- **项目管理**：项目导航、置顶、归档
- **数据统计**：按模型、项目、日期的使用分布
- **Harness 配置查看**：新增 Skills、MCP Servers、Rules、Hooks、Permissions 五个 reader，支持查看和编辑各 provider 的配置，Web 端提供 ConfigView 组件含分组布局和详情面板
- **右键菜单**：项目列表支持右键菜单，包含在 Finder 中打开、在终端中打开、查看详情、置顶/取消置顶、归档/取消归档
- **项目详情浮层**：浮层增加「详情」/「文件」tab 切换，详情页展示元数据和操作按钮
- **文件浏览器**：只读文件浏览功能，左侧可折叠文件树 + 右侧文件预览，按需加载目录内容，自动过滤 `.git`/`node_modules`/`dist` 等
- **语法高亮**：集成 Prism.js，支持 TypeScript/TSX/JSON/CSS/Bash/Python/YAML/Markdown/SQL/Rust/Go/Java 等 20+ 种语言的语法高亮
- **Markdown 渲染**：`.md` 文件使用 marked 渲染为富文本预览，含完整排版样式
- **强制刷新缓存**：工具栏新增刷新按钮，调用 `/api/refresh` 清除缓存并重新拉取数据

### 改进

- **侧边栏重构**：顶部 `super-cli` 标题 + icon 导航项（任务/Harness，带左侧 accent 竖线），主题切换沉到侧边栏底部
- **新建任务下拉**：支持选择 CLI 工具（Claude Code / Qoder / Codex）
- **SessionIndex 缓存 TTL**：`buildIndex()` 增加 30 秒 TTL，超时自动重建索引
- **SessionIndex 共享实例**：server 入口创建唯一 `SessionIndex` 实例，注入到所有路由处理器，避免 4 个独立缓存不同步

### 修复

- **Rules 文件名大小写**：`rules-reader.ts` 中 `agents.md` 修正为 `AGENTS.md`，改为扫描项目目录获取真实文件名（含正确大小写）
- **Web 数据快照问题**：修复服务启动后新 session 不显示的问题，根因是 `SessionIndex.buildIndex()` 首次构建后 `built` 标记永不重置
