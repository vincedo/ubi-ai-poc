---
name: process-findings
description: This skill should be used when the user asks to "process findings", "go through issues one by one", "triage this assessment", "walk me through the findings", "process this review", or "step through the issues". After a note assessment or review, steps through each finding interactively, proposing fixes and applying the user's choices in-place to the note under review.
allowed-tools: Read, Edit
argument-hint: "[file-path] (optional — inferred from context if omitted)"
---

# Process Findings

Step through assessment findings one by one, interactively applying fixes to the note under review.

## Input

`$ARGUMENTS`: Optional file path to the note under review. If omitted, infer the note path from recent conversation context (the last note that was assessed or reviewed).

## Setup

Before starting the loop:

1. **Identify the note under review** — from `$ARGUMENTS` or inferred from context (the file last assessed or reviewed in this conversation). If ambiguous (multiple files were recently discussed), use AskUserQuestion to confirm before proceeding.
2. **Extract the findings list** — from the most recent Claude Code assessment response in this conversation
3. **Read the note** so you have its current content available for edits

If zero findings are extracted (the assessment was entirely positive), announce `No actionable findings found.` and stop.

Then announce: `Processing N findings for [[note-name]].` and begin.

## Progress Tracking

When presenting each finding, open with a header line:

> **Finding X/N** — [one-line label for the issue]

This keeps the user oriented throughout the session.

## What Counts as a Finding

Extract only issues, problems, weaknesses, or improvement suggestions. Skip entirely:

- Sections titled "What works well", "Strengths", "Positives", or similar praise — skip the whole section
- The "bottom line" / summary paragraph if it merely restates findings already listed
- Inline compliments embedded within a finding — strip them, keep only the issue

If the assessment uses numbered or bulleted issues, those are the findings. If findings are embedded in prose sections (e.g., "T5 is weakly justified"), extract each distinct issue as a separate finding. Use judgment — the goal is every actionable issue, no more.

## Process

For each finding, in order:

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

Edit the note to incorporate the chosen fix. Make the minimal change needed — do not rewrite surrounding content.

Confirm with one line:
> `✓ Applied.` *(add a brief note only if the change was non-trivial or the interpretation was ambiguous)*

Then move immediately to the next finding.

## Completion

When all findings have been processed (or the user says "stop"):

> Done. N finding(s) processed — M applied, K skipped.

Do not summarize what changed. The user can review the diff.
