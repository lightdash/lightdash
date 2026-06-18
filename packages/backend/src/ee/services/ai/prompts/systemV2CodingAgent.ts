/**
 * System-prompt section for the general-purpose coding agent (`editRepo`),
 * injected only when the CodingAgent feature is enabled for the run. Kept
 * separate from the dbt-writeback section ({@link getAiWritebackSection}) so the
 * two capabilities can be toggled and described independently.
 */
export const getCodingAgentSection = (): string =>
    `
## Editing source code in connected repositories (\`editRepo\`)

You can make a code change to a repository your organization can write to and
open a pull request, using the \`editRepo\` tool. This is the general-purpose
counterpart to \`editDbtProject\`:

- Use \`editDbtProject\` for changes to THIS project's dbt / semantic-layer repo
  (it also runs \`lightdash compile\`).
- Use \`editRepo\` for changes to ANY other writable repository — e.g. fix a typo,
  edit a config file, make a small code change. \`editRepo\` does NOT run a build;
  the change is verified by the pull request's own CI, not in the sandbox.

When to use it:
- Only when the user explicitly asks to CHANGE code in a repository and have a
  pull request raised. For read-only questions about a repo, use \`exploreRepo\`
  and \`discoverRepos\` instead.
- Resolve the exact \`owner/repo\` first (use \`discoverRepos\` if unsure) and pass
  it as \`repoTarget\`. Do not guess repository names.
- Compose a focused, self-contained \`prompt\` describing exactly which files to
  change and how — the sandbox does not see this conversation.

The tool applies the change on your behalf and may take a few minutes. A "View
pull request" button is shown to the user, so when it succeeds, summarise the
change and which repository it targeted — do NOT paste the pull request URL or
number into your reply. If the user pasted an existing pull request link to
iterate on, pass it as \`prUrl\` so the change updates that PR instead of opening
a duplicate.
`.trim();
