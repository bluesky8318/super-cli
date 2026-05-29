# AGENTS.md

本文件为 AI agent 在本仓库中工作时提供指引。

## 项目概述

`super-cli` 是一个 TypeScript CLI 工具，包含三块核心能力：
1. **Claude Code 任务管理** — 查看所有历史 session，支持自动提炼或手动指定标题，方便选择 session 查看历史或恢复任务
2. **可扩展的自定义 CLI 命令** — 插件式架构，便于后续定制各种命令
3. **Web 看板** — 以任务看板方式在网页端查看 Claude session 历史

## 开发环境

- 语言：TypeScript（strict 模式）
- 运行时：Node.js
- 包管理器：pnpm
- 构建产物输出到 `dist/`

## 约定

- Commit message 用英文，祈使句风格
- 代码和注释用英文；面向用户的字符串可以用中文
- 使用 ESM（package.json 中 `"type": "module"`）

## 架构要点

- Claude Code 的 session 数据存储在 `~/.claude/projects/`，格式为 JSONL
- CLI 入口命令名：`super`
- Web 看板是内置的子模块或 dev server，不是独立应用
