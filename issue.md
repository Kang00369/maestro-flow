# Issue: maestro delegate 长多行 prompt 传参失效,fallback 成只读 analysis 且任务丢失

- **日期**:2026-06-30
- **场景**:router 项目重排分发包,需并行撰写 6 篇文档,主会话用 `maestro delegate` 把文档撰写交给 codex/implement
- **影响**:delegate 派发失败,目标 worker 未执行任何写入;主会话被迫退回自行撰写,串行耗时增加

## 复现命令(已脱敏)

```bash
maestro delegate "<一段约 60 行、含大量中文 + bash 代码块 + --to codex --role implement --mode write 标志的
多行 prompt>" --to codex --role implement --mode write 2>&1 | tail -3
```

通过 `Bash({ run_in_background: true })` 调起。

## 观察到的现象

1. `maestro delegate` CLI **立即返回**,后台 Bash 输出文件为 **0 字节**(没有 exec-id 回显、没有错误)。
2. `maestro delegate list` 显示实际派发的是 `cld-185034-05d8`,角色 `claude/analysis`(只读),**不是**请求的 `codex/implement/write`。
3. 该 worker 的 transcript 显示它说"没有看到你的具体任务或问题",即 **prompt 正文根本没传到 worker**。
4. `--to codex --role implement --mode write` 这些 flag **全部被忽略**。

## 根因推断

- `maestro delegate` 的 CLI 参数解析对**含双引号、反引号、`$`、换行的长 prompt**处理不可靠。
  bash 在 `run_in_background: true` 下用 shell 拼接命令字符串,prompt 里的双引号/反引号/`$ROUTER_BASE` 等
  被 shell 二次解释或截断,导致:
  - 长正文被拆成多个 argv,`--to`/`--role`/`--mode` 被当作 prompt 的一部分丢弃;
  - 剩余无 flag 的调用 fallback 到默认角色链 `claude/analysis`(只读);
  - 正文残缺,worker 收不到任务。
- CLI 对多行 prompt 没有 `--prompt-file` / stdin 这类"传文件而非传参"的逃逸口,长内容只能塞进单个
  shell 参数,极易在引号/转义上出错。

## 期望行为

- `maestro delegate` 应提供 `--prompt-file <path>`(或 `--prompt -` 从 stdin 读)作为长/复杂 prompt 的
  正典入口,避免 shell 引号转义地雷。
- 当 `--to`/`--role`/`--mode` 因解析失败而缺失时,CLI 应**报错退出**(非零退出码 + 明确错误信息),
  而不是静默 fallback 到 `claude/analysis` 只读模式——这会让调用方误以为任务已派发,实际什么都没跑。
- 后台调用时,至少应把 `[MAESTRO_EXEC_ID=...]` 与解析后的 `(tool, role, mode)` 回写到 stdout/输出文件,
  便于 `delegate status <id>` 跟踪;当前 0 字节输出无法定位会话。

## 临时规避

- 短 prompt(<单行、无特殊字符):`maestro delegate` 仍可用。
- 长/含代码块/含 `$` 的 prompt:
  - 写到临时文件,用 `--rule <template>` 或在 prompt 里 `@file` 引用,正文尽量短;
  - 或改用 `Workflow` 的 `agent(prompt, {agentType})`(参数走 JSON,不经 shell 拼接,无此问题)——
    但 Workflow 需用户显式 opt-in;
  - 或主会话直接做(本次采用)。

## 本次后果

- 文档撰写从"并行 delegate"退回"主会话串行 Write",多花了一些时间,但文档已全部产出并随分发包打包完成。
- 无数据损坏;`cld-185034-05d8` 是只读 analysis,未改任何文件。
