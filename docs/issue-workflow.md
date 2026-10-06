# Issue 看板工作流（Agent 指南）

本文档定义 agent（Claude Code、Codex、Kimi CLI 等）在使用 super-cli issue 看板时必须遵守的状态机纪律。所有操作通过 `super-cli issue` CLI 完成，一律使用 `--json` 输出。

## 状态机

```
backlog → todo → in_progress → in_review → done
                   ↓    ↑
                blocked（阻塞时移入，恢复后移回）
取消：任意状态 → canceled
```

## 规则

0. **安装 skill**：agent 侧的工作流说明由内置 skill 提供，运行 `super-cli skill install` 会把它写入各 provider 的全局 skills 目录（`<providerHome>/skills/super-cli-taskboard/SKILL.md`）。
1. **先读后做**：接手 issue 前先 `super-cli issue show <id> --comments --json`，读完整描述和全部评论。评论视为当前需求（含返工）；用户说"先别做"就停。
2. **`backlog` = 未批准执行**：除非用户明确授权，不得认领 backlog 中的 issue。`todo` = 已批准，可认领。
3. **认领即移动**：开始任何实际工作（读代码、写文件）之前，一步完成认领：
   ```bash
   super-cli issue claim ISSUE-3 --session-id <你的sessionId> --json
   ```
   claim = `todo → in_progress` + 绑定 session 的原子操作。失败（已被他人认领/状态不可认领/已归档）就停止并向用户报告；已绑定当前 session 的 `in_progress` issue 可直接续做（claim 幂等）。
4. **增量同步评论**：长任务中用户可能追加评论。续跑时用上次返回的 `nextCursor` 做增量拉取：
   ```bash
   super-cli issue comment ISSUE-3 --after "<cursor>" --json
   ```
5. **完成流程**：验证改动可用后，先评论记录（改动内容、验证方式、遗留风险），再移入 `in_review`：
   ```bash
   super-cli issue comment ISSUE-3 --add "已完成 X，验证方式 Y" --agent --session-id <当前sessionId> --json
   super-cli issue move ISSUE-3 in_review --if-version <N> --json
   ```
6. **`done` 只能由用户移动**：agent 不得自行把 issue 移入 `done`；做不动移 `blocked`（并评论说明阻塞原因），放弃移 `canceled`。
7. **绑定 session**：agent 处理 issue 时应把当前会话绑定上去，便于看板溯源：
   ```bash
   super-cli issue bind ISSUE-3 <sessionId> --json
   ```

## 并发纪律

- 所有写操作携带 `--if-version`（来自最近一次 `show` 的 `version` 字段）。
- 冲突（exit 2 + `VERSION_CONFLICT`）不是错误而是信号：重新读取、重新判断、最多重试一次。
- 已被其他 session 绑定的 issue（`sessionIds` 非空且不含自己）不要接管，除非用户明确要求。

## 常用命令速查

```bash
super-cli issue list --status todo --json
super-cli issue show ISSUE-3 --comments --activity --json
super-cli issue create --title "..." --priority high --label 后端,紧急 --json
super-cli issue move ISSUE-3 in_progress --if-version 2 --json
super-cli issue comment ISSUE-3 --add "进展同步" --agent --session-id <id> --json
super-cli issue bind ISSUE-3 <sessionId> --json
```
