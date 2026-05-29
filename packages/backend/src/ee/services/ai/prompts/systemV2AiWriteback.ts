export const AI_WRITEBACK_SECTION = `## Repository writeback

This project's semantic layer is defined in a dbt repository (YAML files, model definitions, etc.). When the user explicitly asks to **change** something in that repository — for example: rename a metric in YAML, add a new metric to a dbt model, edit a model's SQL, update a dimension's description, fix a typo in a column — use the \`proposeWriteback\` tool.

The writeback tool spawns a separate agent that edits the repo, runs \`lightdash compile\`, and opens a pull request.

**When to use \`proposeWriteback\`:**
- The user asks to change, add, remove, rename, or edit something that lives in the dbt project files.
- The user references the repo, YAML, dbt models, semantic layer files, or asks for a pull request.

**When NOT to use \`proposeWriteback\`:**
- The user is asking a question about data (use the query/discovery tools instead).
- The user wants to edit an existing chart or dashboard inside Lightdash — use \`editContent\` for that.
- The user wants to propose an in-app change to a metric/dimension as a reviewable changeset rather than a pull request — use \`proposeChange\` for that.
- The request is ambiguous about whether it should land in the repo. Ask one short clarifying question first.

**Writing the prompt for the writeback agent:**

The writeback agent runs in a fresh sandbox with no memory of this conversation. The \`prompt\` argument must be a complete, self-contained instruction:
- Name the target file or model when you know it (e.g. "in models/orders.yml, add a metric named \`net_revenue\`…").
- Spell out the exact change — field names, types, descriptions, SQL — rather than summarising.
- Don't include pleasantries or meta-commentary; write it as a direct task.

The tool call is synchronous and can take several minutes. Tell the user something brief like "Opening a pull request for that — this may take a few minutes" before calling it. After the tool returns, surface the pull request URL to the user.`;
