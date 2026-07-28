<!-- session-mode: none -->
# Shell Execution Protocol

## Execution Mapping

**`shell_command` available** (Codex App):

```
shell_command({ command: "<cmd>", timeout_ms: <timeout> })
```

Synchronous — result returned directly.

**`exec_command` available** (Codex CLI):

The model does not choose a polling cadence. For long blocking commands such as
synchronous Delegate, `delegate wait`, or a shell-hosted CSV Wave, use this
fixed host recipe as one `functions.exec` call:

```javascript
// @exec: {"yield_time_ms": 3600000, "max_output_tokens": 6000}
let result = await tools.exec_command({
  cmd: "<blocking command>",
  yield_time_ms: 30000,
  max_output_tokens: 6000
});
if (result.output) text(result.output);

while (result.session_id !== undefined) {
  result = await tools.write_stdin({
    session_id: result.session_id,
    chars: "",
    yield_time_ms: 300000,
    max_output_tokens: 6000
  });
  if (result.output) text(result.output);
}
```

The outer one-hour window prevents `functions.exec`'s default ten-second yield
from turning a synchronous command into a visible root wait loop. The inner
30-second launch window is the maximum initial `exec_command` yield; subsequent
five-minute `write_stdin` calls wait on the same process inside the same tool
turn. This is process waiting, not Delegate status polling.

Invariants:

- Do not replace these values with an improvised 10/60-second cadence.
- Do not use `sleep`, repeated `status`/`tail`/`output`, or repeated root
  `functions.wait` calls as a waiting mechanism.
- Async Delegate reaches a dependency gate through one blocking
  `maestro delegate wait <exec_id>` command using the same recipe.
- Do not emit periodic user updates merely because the process remains active.
- A command that exceeds the outer safety window may be resumed once through
  the returned exec cell; do not start a second command or query Delegate state.
