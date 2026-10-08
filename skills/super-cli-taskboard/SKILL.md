---
name: super-cli-taskboard
description: Work with the local super-cli issue board and idea pipeline. Use when the user asks to claim, list, update, comment on, move, or run an issue; when asked to pick up a task from the board; when recording results or handling blockers; when capturing an idea, categorizing it, or promoting it to an issue; or when invoked headlessly via `super-cli issue run`. Not for GitHub or other external trackers.
---

# super-cli Issue 看板工作流

通过 `super-cli issue` / `super-cli idea` CLI 操作本地看板。所有命令支持 `--json`，写操作支持 `--if-version` 乐观锁。

## 状态机

```
backlog → todo → in_progress → in_review → done
                    ↓    ↑
                 blocked
任意状态 → canceled
```

- `backlog` = 未批准执行。**未经用户明确授权，不认领、不移动、不做任何实际工作。**
- `todo` = 已批准，可认领。
- `in_review` = 完成待验收。**`done` 只能由用户移动，agent 不得自行移入。**
- `blocked` = 做不动时移入，恢复后移回 `in_progress`。

## 认领流程

1. **先读后做**：`super-cli issue show <id> --comments --json`。评论视为当前需求（含返工）；评论说"先别做"就停。
2. **认领原子操作**（在改任何文件之前执行）：
   ```bash
   super-cli issue claim <id> --session-id <你的sessionId> --json
   ```
   一步完成 `todo → in_progress` + 绑定 session。失败（已被他人认领/状态不可认领/已归档）就停止报告，绝不接管别人的 issue。已处于 `in_progress` 且绑定当前 session 的 issue 可幂等续做。
3. **续跑增量同步**：用上次 `comment` 返回的 `nextCursor` 增量拉评论：
   ```bash
   super-cli issue comment <id> --after "<cursor>" --json
   ```

## 完成流程

1. 验证改动可用。
2. 评论记录改动、验证结果、遗留风险：
   ```bash
   super-cli issue comment <id> --add "已完成 X，验证 Y，风险 Z" --agent --session-id <sid> --json
   ```
3. 移入待验收：`super-cli issue move <id> in_review --if-version <v> --json`。
4. 做不动移 `blocked` 并评论说明原因；放弃移 `canceled`。

## 并发纪律

- 写操作携带 `--if-version`（取自最近一次 `show` 的 `version`）。
- 冲突（exit code 2 + `VERSION_CONFLICT`）是信号：重新 `show`，确认仍可认领且需求未变，最多重试一次；否则停止报告。
- 绝不循环重试，绝不接管其他会话的认领。

## 想法（Idea）流水线

一句话记录 → 分类孵化 → 成熟后转为 backlog issue。

```bash
super-cli idea add "<内容>"                                # draft
super-cli idea categories --json                           # 查看可用分类
super-cli idea categorize <id> <category>                  # → incubating，落 md 文档
super-cli idea comment <id> "<补充>"                       # 追加评论（写入 md）
super-cli idea promote <id> [--title] [--project] [--priority]  # → 创建 backlog issue
super-cli idea abandon|archive|restore <id>                # 终态/可恢复
```

未分类的 idea 不能评论或 promote。promote 后 md 文档成为任务的原始需求文档。

## 无头执行（issue run）

用户可通过 `super-cli issue run <id> --agent <name>` 以 headless 模式启动你。此时：

- 首轮 prompt 已含任务标题、描述和本工作流；遵守上述状态机纪律。
- `todo` 状态会自动移入 `in_progress` 并绑定 session，无需再 `claim`。
- 完成后照常评论记录结果；`done` 仍只能由用户移动。
- `super-cli issue runs <id>` 查看执行历史；`super-cli issue stop <id>` 停止当前 run。

## 常用命令

```bash
super-cli issue list --status todo --json          # 找可认领任务
super-cli issue show <id> --comments --json        # 读需求与评论
super-cli issue claim <id> --session-id <sid>      # 认领
super-cli issue comment <id> --add "..." --agent --session-id <sid>
super-cli issue move <id> in_review --if-version N
super-cli issue relate <id> parent|blocks|related <targetId>
super-cli agent list --json                        # 查看可用 agent 配置
```
