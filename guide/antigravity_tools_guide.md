# Antigravity Tools Guide

This document provides a detailed overview of the tools available to the Antigravity AI assistant, including their purposes and schemas.

## 1. ask_permission
Ask the user for permission after a failure due to insufficient permissions.

**Parameters:**
- `Action` (enum): `command`, `unsandboxed`, `mcp`, `custom`, `read_file`, `write_file`, `read_url`, `execute_url`
- `Target` (string): The target of the action (e.g., command prefix, file path, domain).
- `Reason` (string): Why the permission is needed.
- `toolAction` (string): Brief summary of action.
- `toolSummary` (string): Brief noun phrase description.

## 2. ask_question
Ask the user one or more multiple-choice questions.

**Parameters:**
- `questions` (array): List of question objects.
    - `question` (string): The question text.
    - `options` (array): Selectable options.
    - `is_multi_select` (boolean): Allow multiple selections.
- `toolAction` (string)
- `toolSummary` (string)

## 3. define_subagent
Defines a new type of subagent for specialized tasks.

**Parameters:**
- `name` (string): Unique name for the subagent.
- `description` (string): What the subagent does.
- `system_prompt` (string): Detailed instructions for the subagent.
- `enable_write_tools` (boolean): Equip with edit/run tools.
- `enable_mcp_tools` (boolean): Enable MCP tools.
- `enable_subagent_tools` (boolean): Allow it to define its own subagents.
- `toolAction` (string)
- `toolSummary` (string)

## 4. generate_image
Generate or edit images based on a text prompt.

**Parameters:**
- `Prompt` (string): Description of the image.
- `ImageName` (string): Filename for the result.
- `ImagePaths` (array): Optional existing images to use/edit.
- `toolAction` (string)
- `toolSummary` (string)

## 5. grep_search
Find exact pattern matches within files or directories using ripgrep.

**Parameters:**
- `SearchPath` (string): Absolute path to search.
- `Query` (string): Term or pattern to look for.
- `IsRegex` (boolean): Treat query as a regex.
- `CaseInsensitive` (boolean): Ignore case.
- `MatchPerLine` (boolean): Return specific lines and numbers.
- `Includes` (array): Glob patterns to filter files.
- `toolAction` (string)
- `toolSummary` (string)

## 6. invoke_subagent
Invokes one or more subagents by name.

**Parameters:**
- `Subagents` (array): List of subagents to launch.
    - `TypeName` (string): Type of subagent.
    - `Role` (string): Job title/role description.
    - `Prompt` (string): Specific task description.
    - `Workspace` (string): `inherit`, `branch`, or `share`.
- `toolAction` (string)
- `toolSummary` (string)

## 7. list_dir
List contents of a directory.

**Parameters:**
- `DirectoryPath` (string): Absolute path to directory.
- `toolAction` (string)
- `toolSummary` (string)

## 8. list_permissions
List all current permission grants.

**Parameters:**
- `toolAction` (string)
- `toolSummary` (string)

## 9. manage_subagents
Manage existing subagents (list, kill, kill_all).

**Parameters:**
- `Action` (enum): `list`, `kill`, `kill_all`
- `ConversationIds` (array): IDs for 'kill' action.
- `toolAction` (string)
- `toolSummary` (string)

## 10. manage_task
Manage background tasks (list, kill, status, send_input).

**Parameters:**
- `Action` (enum): `list`, `kill`, `status`, `send_input`
- `TaskId` (string): Required for kill/status/send_input.
- `Input` (string): Required for send_input.
- `toolAction` (string)
- `toolSummary` (string)

## 11. multi_replace_file_content
Make multiple, non-contiguous edits to the same file.

**Parameters:**
- `TargetFile` (string): Absolute path.
- `Instruction` (string): Description of changes.
- `Description` (string): Non-obvious rationale.
- `ReplacementChunks` (array): List of chunks.
    - `StartLine` (integer)
    - `EndLine` (integer)
    - `TargetContent` (string)
    - `ReplacementContent` (string)
    - `AllowMultiple` (boolean)
- `TargetLintErrorIds` (array): Optional IDs of fixed lints.
- `ArtifactMetadata` (object): Optional for artifact updates.
- `toolAction` (string)
- `toolSummary` (string)

## 12. read_url_content
Fetch content from a URL (converts HTML to Markdown).

**Parameters:**
- `Url` (string): URL to read.
- `toolAction` (string)
- `toolSummary` (string)

## 13. replace_file_content
Make a single contiguous block of edits to a file.

**Parameters:**
- `TargetFile` (string)
- `Instruction` (string)
- `Description` (string)
- `StartLine` (integer)
- `EndLine` (integer)
- `TargetContent` (string)
- `ReplacementContent` (string)
- `AllowMultiple` (boolean)
- `TargetLintErrorIds` (array)
- `toolAction` (string)
- `toolSummary` (string)

## 14. run_command
Execute a command in the user's shell.

**Parameters:**
- `CommandLine` (string): Command string.
- `Cwd` (string): Working directory.
- `WaitMsBeforeAsync` (integer): Wait time before going async.
- `toolAction` (string)
- `toolSummary` (string)

## 15. schedule
Schedule a one-shot timer or recurring cron job.

**Parameters:**
- `Prompt` (string): Notification message.
- `DurationSeconds` (string): For one-shot timer.
- `CronExpression` (string): For recurring job.
- `MaxIterations` (string): Optional limit for cron.
- `toolAction` (string)
- `toolSummary` (string)

## 16. search_web
Perform a web search for a given query.

**Parameters:**
- `query` (string)
- `domain` (string): Optional domain priority.
- `toolAction` (string)
- `toolSummary` (string)

## 17. send_message
Send a message to another agent (subagent/peer).

**Parameters:**
- `Recipient` (string): Conversation ID.
- `Message` (string)
- `toolAction` (string)
- `toolSummary` (string)

## 18. view_file
View file contents (text, image, pdf, etc.).

**Parameters:**
- `AbsolutePath` (string)
- `StartLine` (integer): For text files.
- `EndLine` (integer): For text files.
- `IsSkillFile` (boolean): Reading for skill instructions.
- `toolAction` (string)
- `toolSummary` (string)

## 19. write_to_file
Create new files or overwrite existing ones.

**Parameters:**
- `TargetFile` (string)
- `CodeContent` (string)
- `Overwrite` (boolean)
- `Description` (string)
- `IsArtifact` (boolean)
- `ArtifactMetadata` (object)
- `toolAction` (string)
- `toolSummary` (string)

## 20. Agent Communication & Coordination

Antigravity agents communicate through a structured messaging system that allows for complex multi-agent workflows.

### Communication Flow
1. **Initiation**: A parent agent uses `invoke_subagent` to start a new agent, receiving a unique `conversationID`.
2. **Messaging**: Agents use `send_message` with the target's `conversationID` to exchange information.
3. **Reactive Wakeup**: The system automatically resumes an idle parent agent when a subagent sends a response, eliminating the need for polling.

### Collaboration Modes (Workspace)
When invoking subagents, different workspace modes define how files are shared:
- `inherit`: The subagent shares the same directory and state as the parent.
- `branch`: The subagent gets an isolated copy/clone of the workspace.
- `share`: The subagent uses a shared underlying repository (similar to git worktree), allowing independent branching with shared storage.

### Best Practices
- **Explicit Prompts**: When invoking a subagent, provide a clear, actionable task description.
- **Background Tasks**: Use subagents for long-running research or complex coding tasks while the main agent continues other work.
- **Message Clarity**: Ensure messages between agents are structured and contain all necessary context, as subagents have their own conversation history.
