# Instruction File Authoring Guide

Maestro instruction files (`*-instructions.md`, `delegate-usage.md` etc.) are injected into LLM context. Every line costs tokens and competes for attention. This guide defines optimization principles.

## Core Principle

**Only write what changes the model's behavior.** If removing a line doesn't change what the model does, delete it.

## Anti-Patterns

### 1. Passive Dependency Assumptions

Bad: "KG stays fresh via hooks — manual search only needed on initial setup"
Problem: Model assumes context is pre-loaded, skips active search.

Fix: Frame all actions as explicit. "ALWAYS search before acting. Never assume context is pre-loaded."

### 2. Flat Tables With Equal Weight

Bad: 7 trigger conditions in one table — model treats all as optional.

Fix: Progressive layering (L0/L1/L2). L0 = unconditional, always execute. L1/L2 = conditional, trigger-based. Model can quickly decide "at least do L0".

### 3. Implementation Details

Bad: "BM25 full-text across all knowledge types", "broker-managed lifecycle", "auto-assembles previous conversation context"

Fix: Delete. Model doesn't need to know HOW a command works internally — only WHEN and WHY to call it.

### 4. Teaching-Style Explanations

Bad: "Not 'Analyze code' but 'Identify auth vulnerabilities; success = OWASP Top 10 covered'"

Fix: Show the template, drop the pedagogy. One good example beats three explanations.

### 5. Duplicate Sections

Bad: "Tool Resolution Priority" in Section 1 AND "Tool Selection" in Section 2 saying the same thing.

Fix: Single source of truth. If info exists in config files, don't repeat it in instructions.

### 6. Structural Tags as Wrappers

Bad: `<context>...</context>`, `<execution>...</execution>`, `<purpose>...</purpose>` wrapping entire sections.

Fix: Delete. Use markdown headers for structure. Tags that don't trigger specific model behavior are noise.

### 7. Soft Language for Hard Rules

Bad: "Search is **not optional**. Execute these commands before acting in the corresponding scenarios:"

Fix: Use `ALWAYS` / `NEVER` directly. "**ALWAYS search before acting.**"

### 8. Verbose Command Descriptions

Bad: `maestro search — BM25 full-text search across all knowledge types including specs, knowhow, and issues`

Fix: `maestro search — all knowledge types`. Purpose in ≤5 words.

## Checklist

Before committing an instruction file, verify:

- [ ] No line explains HOW a tool works internally
- [ ] No duplicate info across sections or with external config files
- [ ] Strong constraints use ALWAYS/NEVER, not "should"/"recommended"
- [ ] High-frequency actions are visually prominent (L0 / top of list)
- [ ] Each command description is ≤10 words
- [ ] No wrapper tags without behavioral function
- [ ] No "fallback" framing that implies a primary automatic path
- [ ] Removed all examples that repeat what a template already shows
