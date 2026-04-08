---
name: process-findings
description: This skill should be used when the user asks to "process findings", "go through issues one by one", "triage this assessment", "walk me through the findings", "process this review", or "step through the issues". After a note assessment or code review, auto-fixes unambiguous findings in-place and steps through the remaining ones interactively.
allowed-tools: Read, Edit, AskUserQuestion
argument-hint: "[file-path] (optional — inferred from context if omitted)"
---

# Process Findings

Auto-fix unambiguous findings immediately, then handle the rest interactively.

## Input

`$ARGUMENTS`: Optional file path to the note or file under review. If omitted, infer the file path from recent conversation context (the last file assessed or reviewed in this conversation).

## Setup

Before starting:

1. **Identify the file under review** — from `$ARGUMENTS` or inferred from context. If ambiguous (multiple files were recently discussed), use AskUserQuestion to confirm before proceeding.
2. **Extract the findings list** — from the most recent Claude Code assessment response in this conversation. If no prior assessment is found in conversation context, use AskUserQuestion to ask the user to paste or specify the source of findings.
3. **Read the file** so you have its current content available for edits.

If zero findings are extracted (the assessment was entirely positive), announce `No actionable findings found.` and stop.

Then announce: `Processing N findings for [[file-name]].` and begin Phase 1.

## What Counts as a Finding

Extract only issues, problems, weaknesses, or improvement suggestions. Skip entirely:

- Sections titled "What works well", "Strengths", "Positives", or similar praise — skip the whole section
- The "bottom line" / summary paragraph if it merely restates findings already listed
- Inline compliments embedded within a finding — strip them, keep only the issue

If the assessment uses numbered or bulleted issues, those are the findings. If findings are embedded in prose sections, extract each distinct issue as a separate finding. Use judgment — the goal is every actionable issue, no more.

## Phase 1: Auto-Fix Pass

Iterate all findings in order. For each finding, decide immediately: **can I make a specific, minimal, unambiguous edit right now?**

### Auto-fix criteria

Auto-fix a finding if and only if **all** of the following are true:
- There is exactly one correct fix — no meaningful alternatives
- No information is missing to produce that fix
- The fix is unambiguous — CC is confident there's one right answer

Defer a finding to Phase 2 if **any** of the following apply:
- Multiple valid options exist with meaningful trade-offs
- A piece of information is missing (e.g., a date, a link target, a decision the user hasn't made)
- The fix is ambiguous — CC isn't confident there's one correct answer
- The fix touches frontmatter (Obsidian notes only — always prompt, regardless of clarity)

Note: scope of change does not determine deferral. A large refactor or structural code change with one clear correct path is auto-fixable. A small wording change with two valid phrasings is not.

### Auto-fix output

For each auto-fixed finding, apply the edit, then log one line:
> `✓ Auto-fixed: [one-line label]`

### End of Phase 1

After iterating all findings:

- If some were deferred:
  ```
  Auto-fixed M finding(s). N finding(s) need your input (findings #X–Y):
  ```
  Then proceed to Phase 2.

- If none were deferred:
  ```
  Auto-fixed all M finding(s).
  ```
  Then jump to Completion.

- If none were auto-fixed (all deferred), skip the Phase 1 summary and go straight to Phase 2 with no announcement.

## Phase 2: Interactive Pass

Run the interactive loop on deferred findings only. The finding counter resets to X/N where N = number of deferred findings.

### Progress Tracking

When presenting each finding, open with a header line:

> **Finding X/N** — [one-line label for the issue]

### 1. Present the Finding

State the issue in 1–3 sentences: direct, no hedging, enough context to act without re-reading the full assessment.

### 2. Suggest a Resolution

Choose the right format based on the finding:

**When there's one clear correction:**
> **Fix:** [what to do]

**When the choice is non-obvious (2–3 meaningful options):**
> **Options:**
> A. [option A]
> B. [option B]
> C. [option C — if applicable]

**When a hybrid approach makes sense, add a compromise after the options:**
> **Options:**
> A. [option A]
> B. [option B]
>
> **Or:** [compromise — e.g., "Do A now and flag B for L3"]

### 3. Wait for the User

Stop. Do not continue to the next finding.

Accept any response:

| Input | Behavior |
|-------|----------|
| `A` / `B` / `C` | Apply the corresponding option |
| `fix` / `yes` / `ok` | Apply the single suggested fix |
| Free text | Interpret as a custom instruction and apply it |
| `skip` | Leave this finding unaddressed, move to the next |
| `stop` | End the session immediately |

### 4. Apply In-Place

Edit the file to incorporate the chosen fix. Make the minimal change needed — do not rewrite surrounding content.

Confirm with one line:
> `✓ Applied.` *(add a brief note only if the change was non-trivial or the interpretation was ambiguous)*

Then move immediately to the next finding.

## Completion

When all findings have been processed (or the user says "stop"):

> Done. N finding(s) total — M auto-fixed, P applied, K skipped.

If the user stops early, count unattempted findings as skipped.

Do not summarize what changed. The user can review the diff.
