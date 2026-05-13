# 学习工具集指南

Maestro 学习工具集的完整使用手册，涵盖 5 个 `learn-*` 命令的原理、用法和协作模式。

---

## 一、概述

### 定位：知识获取子系统

学习工具集是 Maestro 的**交互式深度学习**模块，专注于从代码、文档、决策历史中提取结构化知识。每个命令都遵循科学方法——假设、证据、验证、沉淀——将隐性的工程经验转化为可复用的显性知识。

核心设计原则：

- **强制提问机制**：通过结构化问题避免浅层阅读，确保理解深度
- **并行 Agent 分析**：多个角色同时审视同一目标，消除单一视角偏差
- **证据驱动**：所有结论必须有代码锚点（file:line）支撑
- **自动沉淀**：学习成果自动写入 `specs/learnings.md` 和 `.workflow/knowhow/`

### 与 manage-learn 的区别

| 维度 | learn-* 工具集 | manage-learn |
|------|---------------|--------------|
| 交互模式 | 交互式深度学习，多轮引导 | 原子操作，单次捕获 |
| 目标 | 系统化获取深层理解 | 快速记录单个洞察 |
| 产物 | 结构化报告、pattern catalog、evidence trail | 单条 `<spec-entry>` |
| 适用场景 | 复杂模块分析、架构决策复盘、模式发现 | 会议笔记、突发洞察、快速记录 |
| 耗时 | 数分钟，多 Agent 并行 | 数秒，即时完成 |

简单规则：**需要思考用 learn-*，需要记录用 manage-learn**。

---

## 二、命令详解

### 2.1 learn-retro — 统一复盘

对项目活动进行周期性回顾，从 Git 提交历史和架构决策中提炼洞察。

**使用场景**：

- 周期性回顾（每周/每个迭代）
- 技术债务识别（高 churn 文件、低测试覆盖率区域）
- 决策健康度检查（已做决策是否仍然有效）
- 团队活动分析（每人贡献、会话模式）

**命令语法**：

```bash
/learn-retro                                    # 默认：两种 lens 全量分析最近 7 天
/learn-retro --lens git --days 14               # 仅 Git 分析，最近 14 天
/learn-retro --lens decision --phase 2          # 仅决策分析，聚焦 Phase 2
/learn-retro --lens all --author alice --compare # 全量分析，按作者过滤，对比上次复盘
```

**参数说明**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--lens` | 分析视角：`git` / `decision` / `all` | `all` |
| `--days N` | Git lens 回溯天数 | 7 |
| `--author <name>` | 按作者过滤 | 全部 |
| `--area <path>` | 按目录过滤 | 全部 |
| `--compare` | 与上次复盘对比 | 关闭 |
| `--phase N` | Decision lens 聚焦指定 Phase | 全部 |
| `--tag <tag>` | Decision lens 按标签过滤 | 全部 |
| `--id <id>` | 单独评估指定决策 | — |

#### Git Lens — 活动分析

Git Lens 从原始提交历史中提取量化指标：

| 指标 | 计算方式 | 意义 |
|------|---------|------|
| Test ratio | test_insertions / total_insertions | 测试覆盖投入比例 |
| Churn rate | 变更 >2 次的文件数 / 总文件数 | 代码稳定性 |
| Sessions | 按时间间隔 >2 小时分组的提交聚类 | 工作节奏 |
| LOC/session-hour | 每会话每小时净增代码行 | 开发效率 |

分析产出：
- 每人统计（提交数、LOC、Top 3 活跃区域、测试比例）
- 高 churn 文件清单（不稳定性信号）
- 低测试区域警告（< 20%）
- 与上次复盘的趋势对比（变化 > 20% 会被标记）

#### Decision Lens — 决策质量评估

Decision Lens 收集项目中的架构决策，通过 3 个并行 Agent 从不同维度评估：

| Agent 角色 | 评估维度 | 评级 |
|-----------|---------|------|
| Technical Soundness | 实现是否匹配意图？上下文是否变化？ | sound / degraded / violated |
| Cost Assessment | 增加了多大复杂度？是否引入技术债？ | low-cost / acceptable / expensive / debt-creating |
| Alternative Hindsight | 事后看来是否是正确选择？ | confirmed / questionable / should-revisit |

根据 3 个维度的评级，决策被分类为：

| 状态 | 含义 | 建议 |
|------|------|------|
| Validated | 技术可靠 + 成本可控 + 事后验证 | 无需行动 |
| Aging | 可靠但成本高 | 安排技术债审查 |
| Questionable | 实现已偏离或决策可疑 | 创建 Issue 追踪 |
| Stale | 环境已变化，需重新评估 | 刷新决策文档 |
| Reversed | 代码行为已与决策矛盾 | 记录反转事实 |

**产物路径**：

```
.workflow/knowhow/KNW-retro-{date}.md        # 统一报告（Markdown）
.workflow/knowhow/KNW-retro-{date}.json      # 结构化指标（JSON）
specs/learnings.md                            # 追加 <spec-entry> 块
```

---

### 2.2 learn-follow — 跟读学习

通过逐节引导式阅读，从代码或文档中提取深层理解。

**使用场景**：

- 接手陌生模块，需要快速理解设计意图
- 阅读复杂算法实现，逐层拆解逻辑
- 学习团队编码规范和隐含约定
- 深入理解某个 wiki 文档的设计决策

**命令语法**：

```bash
/learn-follow src/auth/jwt.ts                     # 跟读指定文件
/learn-follow src/utils/ --depth deep              # 深度跟读整个目录
/learn-follow arch-auth-design --save-wiki          # 跟读 wiki 文档并保存笔记
```

**参数说明**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<target>` | 文件路径 / Wiki ID / 主题关键词 | 必填 |
| `--depth shallow\|deep` | 浅层（关键结构和模式）或深层（每个函数、分支） | `shallow` |
| `--save-wiki` | 将阅读笔记保存为 wiki 条目 | 关闭 |

#### 目标解析

命令自动识别输入类型：

| 输入形式 | 解析方式 |
|---------|---------|
| 文件路径（含 `/` 或 `\`） | 直接读取源文件 |
| Wiki ID（如 `spec-auth-flow`） | `maestro wiki get <id>` |
| 主题文字 | `maestro wiki search` 搜索，取首位结果；找不到则 Grep 搜索源码 |

#### 4 个强制提问

跟读的核心是**4 个强制提问（forcing questions）**，对每个章节逐一应用：

| # | 提问 | 提取内容 |
|---|------|---------|
| 1 | 这里使用了什么模式？ | 设计模式、惯用法、约定 |
| 2 | 为什么选择这个方案而不是其他方案？ | 权衡取舍、被排除的选项 |
| 3 | 这段代码依赖什么隐含假设？ | 隐式契约、输入形态、执行顺序 |
| 4 | 如果这里发生变更，什么会崩溃？ | 脆弱点、下游影响范围 |

这 4 个问题确保阅读不会停留在"这段代码做了什么"，而是深入到"为什么这样做、前提是什么、风险在哪里"。

#### 上下文构建

跟读不是孤立地读一个文件——命令会自动构建**1-hop 上下文邻域**：

- **Wiki 条目**：自动加载前向引用和反向引用，读取 Top 3 相关条目
- **代码文件**：解析 import 依赖 + 反向依赖，读取 Top 3 下游消费者
- **目录**：列出文件结构，按 `入口 → 核心 → 工具 → 测试` 排序

#### 模式提取

提取结果会与 `coding-conventions.md` 交叉比对：

- 已文档化的模式 → 标记为 "confirmed convention"
- 未文档化的模式 → 标记为 "candidate for spec-add"，建议录入规范

**产物路径**：

```
.workflow/knowhow/KNW-follow-{slug}-{date}.md    # 理解图（Understanding Map）
specs/learnings.md                                # 追加 <spec-entry> 块
```

---

### 2.3 learn-decompose — 代码模式拆解

将复杂代码系统化拆解为可复用的设计模式目录，4 个维度并行分析。

**使用场景**：

- 模块重构前的模式盘点
- 新成员 onboarding——快速了解模块的架构语言
- 提取团队通用模式，建立 pattern library
- 重构后的文档化——记录新引入的模式

**命令语法**：

```bash
/learn-decompose src/auth/                       # 拆解 auth 模块
/learn-decompose src/utils/ --patterns "Factory,Observer,Strategy"  # 聚焦指定模式
/learn-decompose src/core/ --save-spec --save-wiki  # 拆解并同步到 spec 和 wiki
```

**参数说明**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<target>` | 文件路径 / 目录 / 模块名 | 必填 |
| `--patterns <list>` | 逗号分隔的模式名列表，聚焦分析 | 检测全部 |
| `--save-spec` | 每个新模式自动调用 `spec-add` | 关闭 |
| `--save-wiki` | 按维度创建 wiki 笔记 | 关闭 |

#### 4 维度并行分析

命令同时启动 4 个 Agent，从不同维度扫描代码：

| Agent | 维度 | 检测内容 |
|-------|------|---------|
| 1 — Structural | 结构模式 | 类层次、组合关系、DI/IoC、Factory/Builder/Singleton、barrel exports |
| 2 — Behavioral | 行为模式 | 事件流、中间件链、观察者/发布订阅、命令/策略、状态机 |
| 3 — Data | 数据模式 | Repository/DAO、DTO 管道、缓存策略（memo/LRU/TTL）、序列化、schema 校验 |
| 4 — Error | 错误模式 | 错误边界、重试/退避/熔断、降级链、guard clause、日志策略 |

每个发现都携带：模式名称、维度归属、置信度（high/medium/low）、代码锚点（file:line）、描述、原理、权衡。

#### 交叉引用与去重

分析完成后，所有发现会与已有知识比对：

| 状态 | 条件 |
|------|------|
| documented | 已存在于 `coding-conventions.md` |
| known | 已存在于 `specs/learnings.md` |
| new | 全新发现，未见过 |

跨维度的重复发现会自动合并。与已有文档矛盾的发现会被标记。

#### 与 specs/wiki 的集成

- `--save-spec`：每个 new 状态的模式自动生成规范条目
- `--save-wiki`：按维度分组创建 wiki 笔记，便于后续引用

**产物路径**：

```
.workflow/knowhow/KNW-decompose-{slug}-{date}.md    # Pattern Catalog 报告
specs/learnings.md                                   # 追加 <spec-entry> 块
```

---

### 2.4 learn-second-opinion — 多视角分析

获取对代码、决策或计划的替代视角，避免单一判断的盲区。

**使用场景**：

- 重大架构决策前的多方论证
- 对自己写的代码进行"自我审查"
- 方案评审——确认选择的合理性
- 不确定方案时的"第二意见"咨询

**命令语法**：

```bash
/learn-second-opinion src/auth/jwt.ts                    # 默认 review 模式
/learn-second-opinion src/core/ --mode challenge          # 对抗式质疑
/learn-second-opinion HEAD --mode consult                 # 交互式 Q&A
/learn-second-opinion 2 --mode review                     # 审查 Phase 2 的计划
```

**参数说明**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<target>` | 文件路径 / Wiki ID / `HEAD` / `staged` / Phase 编号 | 必填 |
| `--mode` | `review` / `challenge` / `consult` | `review` |

#### 三种模式

**Review 模式（默认）**：3 个 Agent 并行审查

| Agent 角色 | 关注点 | 核心提问 |
|-----------|--------|---------|
| Pragmatist（实用主义者） | 简洁性、YAGNI、维护成本 | "最简可行方案？维护负担？" |
| Purist（理想主义者） | 正确性、边界情况、类型安全 | "哪些假设可能被违反？" |
| Strategist（战略家） | 可扩展性、架构一致性 | "支撑未来增长？符合架构？" |

每个 Agent 返回：角色名、结论（approve/concern/reject）、置信度、发现清单（含严重度、描述、位置、建议）、摘要。

最终综合为：共识点、分歧点、总判定、Top 3 建议。

**Challenge 模式**：单一对抗 Agent

一个专门的对抗性 Agent 会尝试：

1. 找到最脆弱的假设
2. 构造具体的破坏场景
3. 识别最大风险点
4. 提出替代方案
5. 应用强制提问：

   - "什么会让这个方案失效？"
   - "最简单的破坏方式是什么？"
   - "6 个月后你会后悔什么？"
   - "哪些隐式契约没有被强制执行？"

**Consult 模式**：交互式 Q&A

Agent 先深入学习目标内容，然后进入交互循环：

1. 显示"目标已加载，你想了解什么？"
2. 用户提问 → Agent 带代码引用回答 → 循环
3. 用户说"done"结束 → 编译 Q&A 报告

**产物路径**：

```
.workflow/knowhow/KNW-opinion-{slug}-{date}.md    # 分析报告
specs/learnings.md                                 # 追加 <spec-entry> 块
```

---

### 2.5 learn-investigate — 系统化探究

用科学方法探究代码库中的"为什么"和"怎么做"问题——不是修 bug，而是理解系统。

**使用场景**：

- "这个中间件链的执行顺序是什么？"
- "为什么数据库查询在高并发下变慢？"
- "如果我把缓存层从 Redis 换成 Memcached 会怎样？"
- "这个模块的状态管理是怎么工作的？"

**命令语法**：

```bash
/learn-investigate "JWT 刷新令牌的完整生命周期是什么"
/learn-investigate "为什么队列消费有时会重复处理" --scope src/queue/
/learn-investigate "缓存失效策略有哪些" --max-hypotheses 5
```

**参数说明**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<question>` | 要探究的问题 | 必填 |
| `--scope <path>` | 限制搜索范围 | 整个项目 |
| `--max-hypotheses N` | 最大假设数，超过触发升级 | 3 |

#### 假说测试流程

Investigate 遵循标准的科学方法流程：

```
定义问题 → 收集证据 → 模式匹配 → 生成假设 → 测试假设 → 综合报告
                                                        ↑
                                               3-strike 升级机制
```

**1. 定义问题（S_FRAME）**

解析问题，生成 slug，创建工作目录，搜索先验知识（wiki + specs/learnings + debug-notes）。

**2. 收集证据（S_EVIDENCE）**

并行执行 4 条证据通道：

| 通道 | 方式 |
|------|------|
| 代码搜索 | Grep 问题关键词 |
| 文件检查 | 读取最相关文件 |
| 依赖追踪 | 沿 import 链追踪 |
| Git 历史 | `git log --oneline -10 -- <相关文件>` |

**3. 生成假设（S_HYPOTHESIZE）**

基于证据生成排序列表，每个假设是具体的、可测试的断言：

```
[HIGH] JWT 刷新使用轮转策略，旧令牌在刷新后 5 分钟过期 — Evidence: src/auth/jwt.ts:42, src/auth/refresh.ts:15
[MEDIUM] 刷新令牌存储在 Redis 中，使用 SETEX 命令设置 TTL — Evidence: src/store/token-store.ts:28
```

**4. 测试假设（S_TEST）**

对每个假设按优先级逐一测试：

1. 设计测试——什么证据能确认或推翻？
2. 执行——代码追踪、定向搜索、数据检查
3. 记录——追加 evidence.ndjson
4. 更新——标记 confirmed / disproved / inconclusive

#### 证据日志机制

所有证据以 NDJSON 格式记录到 `evidence.ndjson`：

```json
{"ts": "2026-05-13T14:30:00Z", "type": "code", "source": "src/auth/jwt.ts:42", "relevance": "high", "content": "refreshToken.rotation = true", "note": "确认轮转策略"}
{"ts": "2026-05-13T14:31:00Z", "type": "test", "source": "src/store/token-store.ts:28", "relevance": "high", "content": "await redis.setex(key, ttl, token)", "note": "假设 MEDIUM 确认"}
```

#### 3-strike 升级机制

当所有假设都测试失败（inconclusive）时，触发升级：

1. 向用户提问——是否需要扩大范围或提供新假设？
2. 用户选择"扩大范围" → 回到假设生成阶段，重新开始
3. 用户选择"升级" → 标记为 INCONCLUSIVE，生成已知未解报告

**产物路径**：

```
.workflow/knowhow/KNW-investigate-{slug}/
  ├── evidence.ndjson       # 结构化证据日志
  ├── understanding.md      # 演进中的理解文档
  └── report.md             # 最终报告
specs/learnings.md          # 追加 <spec-entry> 块
```

---

## 三、学习数据流

### 产物结构

所有学习命令的产物遵循统一的存储约定：

```
项目根目录/
├── .workflow/
│   └── knowhow/                           # 学习产物主目录
│       ├── KNW-retro-2026-05-13.md        # 复盘报告
│       ├── KNW-retro-2026-05-13.json      # 复盘指标
│       ├── KNW-follow-auth-jwt-2026-05-13.md    # 跟读笔记
│       ├── KNW-decompose-auth-2026-05-13.md     # 模式目录
│       ├── KNW-opinion-auth-jwt-2026-05-13.md   # 第二意见
│       └── KNW-investigate-token-refresh/        # 探究目录
│           ├── evidence.ndjson
│           ├── understanding.md
│           └── report.md
└── specs/
    └── learnings.md                       # 统一学习沉淀
```

### learnings.md 的结构

`specs/learnings.md` 是所有学习命令的统一沉淀目标，使用 `<spec-entry>` 闭合标签格式：

```xml
<spec-entry category="coding" keywords="jwt,auth,token-rotation" date="2026-05-13" source="learn-follow:src/auth/jwt.ts">
JWT 刷新令牌使用轮转策略，旧令牌在刷新后 5 分钟过期。
每次刷新生成新令牌对，旧令牌加入黑名单。
</spec-entry>
```

每个条目包含：
- `category`：学习类别（coding/arch/debug/learning 等）
- `keywords`：关键词标签，用于搜索和关联
- `date`：发现日期
- `source`：来源命令 + 目标，确保可溯源

### 知识流转路径

```
代码/文档/Git 历史
        │
        ▼
┌─────────────────┐
│  learn-* 命令    │  交互式深度学习
│  (5 个命令)      │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
knowhow/   specs/learnings.md
(NKW-*)    (<spec-entry> 块)
    │         │
    │    ┌────┘
    │    ▼
    │  spec-add / manage-learn
    │  (进一步标准化)
    │    │
    ▼    ▼
 wiki/  coding-conventions.md
 (长期知识库)  (项目规范)
```

关键流转规则：
- 所有学习命令都会**自动**写入 knowhow 报告和 specs/learnings.md
- `--save-spec` / `--save-wiki` 标志控制是否进一步同步到规范系统和 wiki
- 重复发现会自动去重——已有知识标记为 documented/known，仅 new 条目进入沉淀

---

## 四、使用场景速查

### 按意图选择命令

| 你想做什么 | 使用命令 | 示例 |
|-----------|---------|------|
| 回顾过去一周的工作质量 | `learn-retro` | `/learn-retro --lens git --days 7` |
| 检查架构决策是否仍然有效 | `learn-retro` | `/learn-retro --lens decision --phase 2` |
| 理解一个陌生模块的设计 | `learn-follow` | `/learn-follow src/auth/ --depth deep` |
| 学习某段代码的隐含约定 | `learn-follow` | `/learn-follow src/utils/logger.ts` |
| 盘点模块的设计模式 | `learn-decompose` | `/learn-decompose src/core/ --save-spec` |
| 提取可复用的 pattern library | `learn-decompose` | `/learn-decompose src/ --save-wiki` |
| 审查代码质量（多视角） | `learn-second-opinion` | `/learn-second-opinion src/api/` |
| 对方案进行压力测试 | `learn-second-opinion` | `/learn-second-opinion HEAD --mode challenge` |
| 就某个实现向 AI 请教 | `learn-second-opinion` | `/learn-second-opinion plan.json --mode consult` |
| 理解"为什么会这样工作" | `learn-investigate` | `/learn-investigate "缓存穿透的原因是什么"` |
| 探究某条调用链的完整路径 | `learn-investigate` | `/learn-investigate "请求从入口到数据库的路径"` |

### 典型工作流组合

**新成员 Onboarding**：

```bash
/learn-follow src/                          # 跟读源码目录，理解整体结构
/learn-decompose src/core/ --save-wiki       # 拆解核心模块模式
/learn-retro --lens git --days 30            # 了解最近的开发活动
```

**架构决策前**：

```bash
/learn-follow src/auth/ --depth deep         # 深入理解现有实现
/learn-second-opinion src/auth/ --mode review # 多视角审查
/learn-second-opinion src/auth/ --mode challenge  # 对抗式质疑
/learn-investigate "如果把认证改为 OAuth2 会影响哪些模块"
```

**迭代复盘**：

```bash
/learn-retro --lens all --days 14 --compare  # 全量复盘，对比上次
/learn-investigate "为什么 Phase 3 的 churn rate 那么高" --scope src/api/
/learn-decompose src/api/ --save-spec        # 提取新模式到规范
```

**问题排查（理解而非修复）**：

```bash
/learn-investigate "为什么队列消费延迟在高峰期增加" --scope src/queue/
/learn-follow src/queue/worker.ts            # 跟读关键文件
/learn-second-opinion src/queue/ --mode consult  # 交互咨询
```

### 命令间的自然衔接

每个 learn 命令执行完成后，会推荐后续步骤。常见的衔接路径：

```
learn-follow → learn-decompose     # 从理解到模式提取
learn-follow → learn-second-opinion # 从理解到多视角验证
learn-decompose → spec-add          # 从模式发现到规范录入
learn-retro → learn-investigate     # 从复盘发现到深入探究
learn-investigate → learn-follow    # 从问题定位到深入阅读
learn-second-opinion → learn-decompose  # 从质疑到系统化拆解
```
