---
name: investigate-pylon
description: Investigate a Pylon support ticket. Use when asked to investigate, triage, or look into a Pylon issue. Classifies the ticket, searches for existing GitHub/Linear issues, searches docs, inspects code if needed, and drafts a customer reply.
allowed-tools: Read, Grep, Glob, Bash, WebFetch
---

# Investigate Pylon Ticket

Investigate Pylon issue `$ARGUMENTS`.

## Step 1: Gather context

1. Fetch the Pylon issue using `get_issue` with the issue number
2. Fetch the full message history using `get_issue_messages`
3. Fetch the customer account using `get_account`

Summarize: who is the customer, what are they reporting, and any relevant account context.

## Step 2: Classify the ticket

Based on the issue content, classify it as one of:
- **Question** - the customer is asking how to do something
- **Feature request** - the customer wants functionality that doesn't exist
- **Bug** - something is broken or behaving unexpectedly

State your classification clearly before proceeding.

## Step 3: Investigate based on type

### If it's a question

1. Search Lightdash docs using `SearchLightdash` with relevant keywords
2. Find the most relevant documentation pages
3. Draft a reply that answers the question and links to the docs

Before answering, consider whether you need to ask the customer to clarify their setup. For example: are they using the CLI, GitHub Actions, or the Lightdash App UI? Don't guess if a clarifying question would narrow it down.

### If it's a feature request

1. Search GitHub for existing issues:
   ```
   gh search issues --repo lightdash/lightdash "<relevant keywords>" --state open
   ```
2. Also try broader search terms if the first search returns nothing
3. If a matching issue exists: note it with a link and its current status
4. If no match exists: draft a GitHub issue body (title + description). Do NOT create it yet.

### If it's a bug

1. Search GitHub for existing bug issues:
   ```
   gh search issues --repo lightdash/lightdash "<relevant keywords>" --label bug
   ```
2. Search the codebase for relevant code:
   ```
   gh search code --repo lightdash/lightdash "<relevant keywords>"
   ```
3. Review what you find in the code. Determine:
   - Is this intended behavior?
   - Is this a genuine bug?
   - What part of the code is responsible?
4. If no existing issue: draft a GitHub issue body. Do NOT create it yet.

**Important**: If you need to create a GitHub issue, always create it on GitHub (not Linear). The GitHub-Linear sync will automatically create a linked Linear issue. Creating in Linear first causes duplicates.

## Step 4: Draft a customer reply

Write a draft reply to send to the customer. Rules:

- Keep it concise and natural. Write like a human, not an AI.
- Never use em dashes.
- Be friendly and direct.
- If it's a question: include the answer with links to relevant docs.
- If it's a bug or feature request: acknowledge what they reported and let them know we're looking into it.
- If you need more info from the customer, ask a specific clarifying question instead of guessing.
- Do not be verbose. Short sentences. No filler.

## Step 5: Draft internal engineering message (if needed)

Only if the issue needs engineering investigation, draft a message for the support engineer. Include:

- What the customer reported (1-2 sentences)
- What you found in the code (with file paths or links)
- Specific questions or asks for the engineer

Keep it actionable. Engineers are busy, don't make them read a wall of text.

## Step 6: Present everything

Output your findings in this format:

```
## Classification
[Question / Feature Request / Bug]

## Customer
[Account name and relevant context]

## Summary
[What the customer is asking about, 2-3 sentences max]

## Related Issues
[Links to any matching GitHub/Linear issues found, with status. Or "None found."]

## Relevant Docs
[Links to relevant Lightdash docs. Or "None found."]

## Code Findings
[Only if bug: what you found in the codebase. File paths, brief explanation.]

## Draft Customer Reply
[The reply to copy into Pylon/Slack]

## Draft Engineering Message
[Only if needed: the internal message for the engineer]

## Draft GitHub Issue
[Only if needed: the issue title and body to create]
```

**Do not auto-create GitHub issues, send Slack messages, or take any action beyond presenting drafts. Everything stays in this chat for the AE to review and act on.**
