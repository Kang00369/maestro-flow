# 杂项命令指南

Maestro 工作流中用于维护、发布和规范管理的辅助命令。

---

## 一、maestro-amend — 增量修改

### 用途

信号驱动的 Overlay 生成器。从多种来源收集工作流缺陷信号，诊断哪些命令需要补充修改，批量生成针对性的 Overlay 补丁。所有修改通过 Overlay 系统（`~/.maestro/overlays/*.json`）完成——不侵入原始命令文件，幂等且重装后保留。

与 `/maestro-overlay`（单次显式创建）不同，`/maestro-amend` 通过分析工作流产物自动**发现**需要修复的内容。

### 使用场景

- `/maestro-verify` 暴露了命令步骤缺失（如缺少预检查、验证不充分）
- `/quality-review` 发现流程层面的不足（非代码 Bug）
- 工作流执行中出现偏差，根因指向命令定义不完整
- Issue 追踪显示同类问题反复出现，根源在命令设计

### 信号来源

| 标志 | 来源 | 采集内容 |
|------|------|---------|
| `--from-verify <dir>` | verification.json | 验证失败暴露的工作流缺口 |
| `--from-review <dir>` | review.json | 代码审查发现的流程缺陷 |
| `--from-session <id>` | 会话产物 | 执行期间遇到的问题 |
| `--from-issues ISS-xxx,...` | issues.jsonl | 追溯到命令缺陷的 Issue |
| `--scan` | 自动扫描 .workflow/ | 发现所有工作流相关信号 |
| _(位置参数文本)_ | 用户描述 | 直接观察和说明 |

多个来源可组合使用。不传参数时进入交互模式（自动扫描 + 用户确认）。

### 工作流程

```
收集信号 → 诊断分类 → 分组规划 → 预览确认 → 生成 Overlay → 安装
```

1. **收集信号**：从指定的来源提取缺陷信号。信号会被分类为"命令缺陷"或"代码 Bug"，前者继续处理，后者路由到其他修复命令
2. **诊断映射**：为每个信号确定目标命令、目标 section、补丁模式（prepend/append/new-section）
3. **分组规划**：按目标命令 + section 分组，生成 section map 并展示注入点
4. **预览确认**：展示注入点地图，用户确认或编辑
5. **生成安装**：生成 Overlay JSON 文件，通过 `maestro overlay add` 安装到命令文件

### 控制选项

```bash
# 预览模式（不安装）
/maestro-amend --dry-run

# 跳过确认
/maestro-amend -y

# CLI 目标：claude（默认）/ codex / both
/maestro-amend "cli": "both"
```

### 常见用法

```bash
# 从验证结果中发现命令缺口
/maestro-amend --from-verify .workflow/phases/1

# 从审查结果中提取流程改进
/maestro-amend --from-review .workflow/phases/2

# 自动扫描所有信号
/maestro-amend --scan

# 直接描述问题
/maestro-amend "maestro-execute 缺少 CLI 编译验证步骤"
```

---

## 二、maestro-update — 更新检查

### 用途

检测当前 `.workflow/` 的 schema 版本，展示可用的迁移计划，并逐步交互式执行版本升级。支持增量式版本链升级（如 1.0 → 2.0 → 3.0）。

### 使用场景

- Maestro 升级后，`.workflow/` 目录结构或 schema 发生变化
- 项目初始化较早，需要迁移到新版格式
- 版本兼容性检查

### 检查范围

- `.workflow/state.json` 中的 `version` 字段（默认为 `"1.0"`）
- `src/migrations/` 下的迁移注册表（每个迁移是独立文件，如 `v1-to-v2.ts`）
- 迁移链自动推导：检测当前版本 → 遍历链路 → 按顺序应用

### 标志

| 标志 | 说明 |
|------|------|
| `--dry-run` | 仅预览迁移计划，不执行 |
| `--force` | 跳过确认提示，应用所有待执行迁移 |

### 执行流程

```
检测版本 → 预览计划 → 逐步确认 → 执行迁移 → 汇总报告
```

1. **检测版本**：读取 `.workflow/state.json`，提取 `version` 字段
2. **预览计划**：以 dry-run 模式运行迁移 CLI，展示完整迁移链。已是最新版本时直接退出
3. **逐步确认**：对每个迁移步骤询问用户（`--force` 跳过）。选项：yes / skip / abort
4. **执行迁移**：每个步骤执行前先创建 `state.json` 备份，执行后展示变更明细。失败时可从备份恢复
5. **汇总报告**：展示已应用/跳过的迁移数量、版本变化

### 常见用法

```bash
# 检查是否有待执行的迁移
/maestro-update --dry-run

# 交互式逐步升级
/maestro-update

# 一键全量升级
/maestro-update --force
```

### 注意事项

- 跳过某个迁移步骤可能破坏版本链（系统会发出警告）
- 每次迁移前自动创建备份：`.workflow/state.json.backup-v{from}-{timestamp}`
- 迁移失败时可手动恢复：`cp .workflow/state.json.backup-v{from}-{timestamp} .workflow/state.json`

---

## 三、spec-remove — 规范移除

### 用途

从 specs 文件中移除指定的 `<spec-entry>` 条目。与 `/spec-add` 互为对称操作，使用 `maestro wiki remove-entry` 实现原子删除并自动更新索引。

### 使用场景

- 规范条目已过时或不再适用
- 规范被更高优先级的条目替代
- 清理重复或错误的规范

### Entry ID 格式

```
spec-{file-stem}-{NNN}
```

例如：`spec-learnings-003`、`spec-coding-conventions-001`。该 ID 由 WikiIndexer 在索引 `<spec-entry>` 块时分配。

### 查找 Entry ID

```bash
# 列出所有 spec 条目
maestro wiki list --type spec --json

# 按关键词搜索
/spec-load --keyword auth
```

### 操作范围

- 从容器文件中移除指定的 `<spec-entry>` 块
- Wiki 索引自动更新
- 需要用户确认（`-y` 跳过）

### 常见用法

```bash
# 移除指定条目
/spec-remove spec-learnings-003

# 移除前先用 spec-load 查找目标
/spec-load --keyword "deprecated-pattern"
/spec-remove spec-coding-conventions-001
```

### 注意事项

- 执行前需确认 `.workflow/specs/` 已初始化（通过 `/spec-setup`）
- Entry ID 必须是 spec 类型的子节点，其他类型的 ID 会被拒绝
- 移除操作不可逆（建议先用 `/spec-load` 预览内容）

---

## 四、maestro-milestone-release — 里程碑发布

### 用途

将已完成的里程碑打包为可发布版本。执行版本号提升（semver）、生成或追加 Changelog 条目、创建 annotated git tag，并可选推送到远端。是 SDLC 循环的最终交付步骤。

### 使用场景

- 里程碑完成并通过审计，需要正式发布
- 版本号管理（patch / minor / major）
- 自动生成变更日志

### 前置条件

| 条件 | 说明 |
|------|------|
| 里程碑已完成 | `/maestro-milestone-complete` 已执行 |
| 审计通过 | audit report verdict 为 PASS |
| 工作区干净 | 无未提交变更（`--dry-run` 例外） |

### 标志

| 标志 | 说明 |
|------|------|
| `<version>` | 显式指定版本号（如 `1.2.0`） |
| `--bump patch\|minor\|major` | 基于当前版本递增（默认 `minor`） |
| `--dry-run` | 计算版本、预览 Changelog 和 tag，不写入 |
| `--no-tag` | 跳过 git tag 创建（仅版本提升 + Changelog） |
| `--no-push` | 跳过 `git push --follow-tags` |

### 发布流程

```
验证前置条件 → 解析版本 → 收集变更 → 生成 Changelog → 写入版本 → 创建 Tag → 推送
```

1. **验证前置条件**：确认里程碑已完成、审计通过、工作区干净
2. **解析版本**：从显式参数或 `--bump` 计算目标版本，版本必须单调递增
3. **收集变更**：从里程碑 summary、phase summaries、git log（上次 tag 至今）聚合变更内容
4. **生成 Changelog**：写入 `CHANGELOG.md`，按 phase / 变更类型分组
5. **写入版本**：更新 manifest 文件（`package.json` / `pyproject.toml` / `Cargo.toml` 等，自动检测），创建 release commit
6. **创建 Tag**：创建 annotated git tag `v{version}`，包含 release notes
7. **推送远端**：`git push --follow-tags`

### 发布报告

完成后展示：

```
=== RELEASE COMPLETE ===
Version:   v{previous} → v{new}
Milestone: {milestone_name}
Tag:       v{new} {pushed|local-only}
Changelog: {N} entries written to CHANGELOG.md
Manifest:  {file_path} updated
```

### 与里程碑生命周期的关系

里程碑的完整生命周期为：

```
/maestro-milestone-complete  →  /maestro-milestone-audit  →  /maestro-milestone-release
```

- **`/maestro-milestone-complete`**：归档当前里程碑，推进到下一里程碑。生成 summary.md
- **`/maestro-milestone-audit`**：跨 Phase 集成验证，生成 audit-report.md。verdict 必须为 PASS
- **`/maestro-milestone-release`**：最终发布步骤，依赖前两步的产出物

顺序不可颠倒：complete 产出 summary → audit 基于 summary 验证 → release 基于 audit 结果发布。

### 常见用法

```bash
# 标准发布（minor 版本递增）
/maestro-milestone-release

# 补丁版本
/maestro-milestone-release --bump patch

# 显式指定版本
/maestro-milestone-release 2.0.0

# 仅预览，不执行
/maestro-milestone-release --dry-run

# 发布但不推送
/maestro-milestone-release --no-push
```

### 注意事项

- 如果版本 manifest 文件不存在或不支持，可手动指定版本并使用 `--no-tag`
- 远端推送失败时（网络/认证问题），可手动执行 `git push --follow-tags`
- `--dry-run` 模式下不写入任何文件、不创建 tag，仅展示计算结果
