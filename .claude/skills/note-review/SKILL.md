---
name: note-review
description: This skill should be used when the user asks to "review this note" or "assess this note". Critically assesses a note's content substance — accuracy, gaps, redundancies, contradictions, outline quality, and logical flow — and outputs only actionable findings with suggested fixes.
allowed-tools: Read, AskUserQuestion
argument-hint: "<path to .md file>"
---

# Note Substance Review

Critically assess a note for content quality. Output only findings — no praise, no summary of strengths.

This skill covers content substance only (accuracy, gaps, structure). For prose quality (grammar, readability, sentence flow), use `note-proofread` instead.

## Input

`$ARGUMENTS` must be a file path. Read the file first.

**If empty**: Infer from the most recent note discussed in the conversation. If ambiguous, use AskUserQuestion to confirm.

## Process

1. Read the note in full. If the file is a template, config file, `.base` file, or non-prose artifact, stop and output: "This skill is designed for PKM notes — not applicable to [file type]."
2. Assess it across the six dimensions below
3. Collect every distinct flaw found
4. Output findings as a numbered list, each with a suggested fix

## Assessment Dimensions

Evaluate the note on each of these, in order:

### 1. Accuracy

Are the facts, claims, and technical details correct? Flag anything that appears wrong, outdated, or unverifiable. Note the specific claim and what you believe is incorrect or uncertain.

### 2. Gaps

What is missing that a reader would reasonably expect, given the note's stated scope and title? Only flag gaps that matter — omissions that would leave the reader without something they need.

### 3. Redundancies

Is the same information stated more than once within the note without added value? Flag exact or near-exact repetition.

### 4. Contradictions

Do any two parts of the note conflict with each other? Flag the conflicting statements.

### 5. Outline & Structure

Are the headings appropriate and well-scoped? Is any section too broad, too narrow, or misnamed? Do headings and category labels accurately describe the content they contain? Would the note benefit from splitting, merging, or reordering sections?

### 6. Logical Flow

Does the order of ideas make sense? Does the reader have what they need before each concept is introduced? Flag any sequencing issue that forces the reader to backtrack or anticipate content not yet presented.

## Output Format

Output a numbered list. Each finding follows this structure:

**N. [Dimension] — [one-line label]**
[2–4 sentences describing the issue clearly enough to act on without re-reading the full assessment.]
**Fix:** [concrete suggestion — what to add, remove, rewrite, restructure, or verify]

**Rules:**

- No introductory paragraph, no closing summary
- No "Strengths", "What works well", or equivalent section — omit praise entirely
- If a dimension has no issues, skip it silently — do not write "No issues found in X"
- If the note is a stub or draft (e.g., contains TBD placeholders), flag each placeholder as a gap finding
- Keep findings independent — do not reference other findings by number
- If no findings are identified across all dimensions, output a single line: "No substance issues found."
