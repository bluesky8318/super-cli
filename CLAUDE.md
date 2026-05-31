# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本项目的通用 agent 指引（适用于 Claude Code、Qoder CLI、Codex CLI 及其他 AI agent）统一维护在 **[AGENTS.md](./AGENTS.md)**，请先阅读该文件获取完整的项目概述、架构说明、常用命令和编码约定。

本文件仅补充 Claude Code 特有的注意事项：

## Claude Code 特有说明

- `AGENTS.md` 是本仓库唯一的 agent 指引文件，Claude Code 与 Qoder CLI、Codex CLI 共享同一份
- 如需修改项目指引，请编辑 `AGENTS.md`，不要在 `CLAUDE.md` 中重复内容
- Claude Code 的 session 数据位于 `~/.claude/projects/<编码路径>/<uuid>.jsonl`，是本项目直接读取的数据源
- `super-cli` 本身也是一个 Claude Code session 管理工具，在开发本项目时可直接使用自身功能验证
