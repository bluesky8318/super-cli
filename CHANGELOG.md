# Changelog

本文件记录 super-cli 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
