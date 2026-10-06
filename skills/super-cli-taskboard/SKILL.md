---
name: super-cli-taskboard
description: Claim and work issues from the super-cli board when the user mentions super-cli issues, the task board, or asks you to pick up / claim a task. Use for claiming work, syncing issue status, and recording results. Not for GitHub or other external trackers.
---

# super-cli Issue 看板工作流

通过 \`super-cli issue\` CLI 操作本地 issue 看板。所有命令支持 \`--json\` 结构化输出，写操作支持 \`--if-version\` 乐观锁。

## 状态机

\`\`\`
backlog → todo → in_progress → in_review → done
                   ↓    ↑
                blocked（阻塞时移入，恢复后移回）
取消：任意状态 → canceled
\`\`\`

- \`backlog\` = 灵感/未批准执行：除非用户明确授权，不认领、不移动、不做任何实际工作。
- \`todo\` = 已批准，可认领。
- \`done\` 只能由用户明确验收后移动，agent 不得自行移入。

## 认领流程

1. **先读后做**：\`super-cli issue show <id> --comments --json\`，读完整描述和全部评论。评论视为当前需求（含返工）；评论说"先别做"就停。
2. **认领原子操作**（在开始读代码、改文件之前执行）：
   \`\`\`bash
   super-cli issue claim <id> --session-id <你的sessionId> --json
   \`\`\`
   claim 会一步完成 todo → in_progress + 绑定 session。失败（已被他人认领/状态不可认领/已归档）就停止并报告，绝不接管别的会话已认领的 issue。
   已处于 in_progress 且绑定了当前 session 的 issue 可以直接续做，claim 幂等。
3. **续跑增量同步**：用上次 \`comment\` 返回的 \`nextCursor\` 增量拉评论：
   \`\`\`bash
   super-cli issue comment <id> --after "<cursor>" --json
   \`\`\`

## 完成流程

1. 验证改动可用（直接操作路径验证）。
2. 评论记录改动内容、验证结果、遗留风险：
   \`\`\`bash
   super-cli issue comment <id> --add "已完成 X，验证方式 Y，风险 Z" --agent --session-id <你的sessionId> --json
   \`\`\`
3. 移入待验收：
   \`\`\`bash
   super-cli issue move <id> in_review --if-version <version> --json
   \`\`\`
4. 做不动移 \`blocked\`（并评论说明阻塞原因），放弃移 \`canceled\`。

## 并发纪律

- 写操作携带 \`--if-version\`（取自最近一次 \`show\` 的 \`version\`）。
- 冲突（exit code 2 + \`VERSION_CONFLICT\`）不是错误而是信号：重新 \`show\`，确认 issue 仍可认领且需求未变，最多重试一次；否则停止报告。
- 绝不循环重试，绝不接管其他会话的认领。

## 常用命令

\`\`\`bash
super-cli issue list --status todo --json          # 找可认领任务
super-cli issue show <id> --comments --json        # 读需求
super-cli issue claim <id> --session-id <sid>      # 认领
super-cli issue comment <id> --add "..." --agent --session-id <sid>
super-cli issue move <id> in_review --if-version N
\`\`\`
