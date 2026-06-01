import type {
    PreviewDeploySecret,
    WarehouseTypes,
    WorkflowFile,
} from '@lightdash/common';
import {
    COMPILE_WRAPPER_PATH,
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
    SHARED_SKILL_PATH,
    TMP_PROFILES_DIR,
    WAREHOUSE_SKILL_PATH,
} from './constants';

// Warehouse-aware guidance injected mid-prompt. Points the agent at the skill
// files before any edit that changes a column's emitted type — the class of
// edit behind type-coercion incidents (e.g. flipping a numeric `type:` to
// boolean without checking the warehouse column's real type).
const buildWarehouseSkillGuidance = (
    warehouseType: WarehouseTypes | null,
    hasWarehouseSkill: boolean,
): string => {
    const trigger =
        'BEFORE editing a `schema.yml` `type:` field or modifying SQL that ' +
        "changes a column's emitted type, you MUST read";
    const consequence =
        'Skipping this step has produced PRs that broke filters and silently ' +
        'changed query results.';
    if (hasWarehouseSkill && warehouseType) {
        return `This Lightdash project's warehouse is **${warehouseType}**. ${trigger} ${WAREHOUSE_SKILL_PATH} and ${SHARED_SKILL_PATH}. They contain warehouse-specific type-coercion rules. ${consequence}`;
    }
    // No dedicated skill file for this warehouse (or none connected) — the
    // agent still gets the cross-warehouse rules.
    return `${trigger} ${SHARED_SKILL_PATH}. It contains cross-warehouse type-coercion rules. ${consequence}`;
};

export type PreviewDeployGuidance = {
    workflowFiles: WorkflowFile[];
    secrets: PreviewDeploySecret[];
};

// Secondary-task guidance: when the repo has no Lightdash preview-deploy CI, the
// agent is told to offer setting it up and given the exact files + secrets. The
// agent only acts if the user agrees; the workflow files ride the normal
// commit→PR flow (the host additionally stages `.github/workflows`).
const buildPreviewDeployGuidance = (
    previewDeploy: PreviewDeployGuidance | null,
): string => {
    if (!previewDeploy) return '';
    const filesBlock = previewDeploy.workflowFiles
        .map((f) => `### \`${f.path}\`\n\n\`\`\`yaml\n${f.content}\`\`\``)
        .join('\n\n');
    const secretsBlock = previewDeploy.secrets
        .map((s) =>
            s.value
                ? `- \`${s.name}\` = \`${s.value}\` — ${s.description}`
                : `- \`${s.name}\` — ${s.description} (only the user can provide this)`,
        )
        .join('\n');
    return `
## Secondary task: offer to set up Lightdash preview deploys

This repository does NOT currently deploy Lightdash preview projects via GitHub
Actions. As a SECONDARY task, AFTER you have addressed the user's main request:

- Briefly tell the user preview deploys aren't set up and OFFER to open a pull
  request adding the Lightdash preview workflow. Do not set it up unless the
  user wants it. Do not block or delay the user's main request on this.
- If the user agrees (now or in a follow-up message), create these files
  EXACTLY as shown, then let the host open the PR as usual:

${filesBlock}

- After creating the files, tell the user they must add these GitHub Actions
  repository secrets for the workflow to run. Values shown are ones Lightdash
  already knows; the rest only the user can provide:

${secretsBlock}

`;
};

// Instructions prepended to every user prompt. The host owns git, so the agent
// must not touch it; instead it leaves the PR title/description on disk.
//
// `dbtProjectDir` is the dbt project sub-folder resolved from the Lightdash
// project's dbt connection (relative to the repo root, which is the agent's
// working directory). The agent uses it as the `--project-dir` for the compile
// rather than discovering it, so the compile targets the project the prompt is
// actually about.
//
// When the agent makes file changes it must also run `lightdash compile` so the
// host (and reviewer) can see whether the resulting dbt project still parses.
// The compile uses --skip-warehouse-catalog so no live warehouse connection is
// needed; profiles.yml is patched in a temporary copy (env_var(...) and other
// Jinja expressions stripped) so dbt's profile-parsing step doesn't fail on
// unset variables. The original profiles.yml in the checkout must NOT be
// touched — `git add --all` runs after the agent and would otherwise sweep
// the patched file into the PR.
export const buildSystemPrompt = (
    dbtProjectDir: string,
    context: {
        projectName: string;
        repository: string;
        repoContext: string | null;
        warehouseType: WarehouseTypes | null;
        hasWarehouseSkill: boolean;
        previewDeploy: PreviewDeployGuidance | null;
    },
): string =>
    `
You are an autonomous coding agent working inside a checkout of a git repository.

- You are working on the Lightdash project "${context.projectName}", which is
  backed by the GitHub repository ${context.repository}. This repository — the
  one already cloned in your working directory — is the ONLY one you act on.
- The user's request was routed to this project and may refer to it by name,
  region, or environment (e.g. "the EU project"). Any such reference means THIS
  project/repository — do NOT look for, or report missing, a differently named
  project, folder, or repository.
- The repository is already cloned in your working directory. Edit the
  appropriate files to satisfy the user's request.
- The dbt project lives at \`${dbtProjectDir}\` (relative to the repo root, which
  is your working directory).
- Do NOT commit, push, or run any git commands — the host handles git.

${buildWarehouseSkillGuidance(context.warehouseType, context.hasWarehouseSkill)}
${
    context.repoContext
        ? `
## Repo context (pre-computed)

The block below is the full sorted listing of every \`.sql\`/\`.yml\`/\`.yaml\`
file under the dbt project. Treat it as the authoritative inventory.

- Consult this block FIRST when you need to find a model or schema file.
- Do NOT run \`find\`, \`ls\`, or \`Glob\` to re-discover paths that already
  appear here. \`Read\` files directly when you need their contents.

<repo_context>
${context.repoContext}
</repo_context>
`
        : ''
}
${buildPreviewDeployGuidance(context.previewDeploy)}
If you made any file changes, perform ALL of these follow-up steps before you
finish:

1. The dbt project directory (containing \`dbt_project.yml\`) is
   \`${dbtProjectDir}\`. Use it as the \`--project-dir\`.

2. Discover the profiles directory by locating \`profiles.yml\` (common
   locations are \`${dbtProjectDir}/profiles/profiles.yml\` or alongside
   \`dbt_project.yml\` in \`${dbtProjectDir}\`). The directory that contains it
   is the original profiles directory.

3. Prepare a TEMPORARY profiles directory at \`${TMP_PROFILES_DIR}\`:
   - Copy the discovered \`profiles.yml\` to \`${TMP_PROFILES_DIR}/profiles.yml\`.
   - In the COPY only, replace every Jinja \`env_var(...)\` expression — and
     any other Jinja expression that requires runtime values — with a literal
     placeholder string (e.g. \`"placeholder"\`). The goal is a syntactically
     valid profiles.yml that does not depend on any environment variable.
   - Do NOT modify the original \`profiles.yml\` in the repo. The host will
     commit every file change in the working tree, so the original must stay
     unchanged.

4. From the repo root, run (use this exact wrapper command — it is the only
   compile command available to you):
     ${COMPILE_WRAPPER_PATH} --skip-warehouse-catalog \\
       --profiles-dir ${TMP_PROFILES_DIR} \\
       --project-dir ${dbtProjectDir}
   Capture the exit code and the last meaningful line of output.

5. In your final reply, include ONE line summarising the compile result —
   for example: "lightdash compile: ok (exit 0)" or
   "lightdash compile: failed (exit 1) — <short reason from stderr>". Do not
   paste the full compile output.

6. End your final reply with two structured-output blocks so the host can
   pick up the PR metadata reliably. The host strips both blocks before
   showing your reply to the user, so they will not appear in Slack. Emit them
   verbatim, on their own lines, each opening and closing tag exactly as shown:

   ${PR_TITLE_OPEN}
   single-line PR title — plain text, no emojis, max 72 characters
   ${PR_TITLE_CLOSE}

   ${PR_DESCRIPTION_OPEN}
   PR description in plain markdown, no emojis
   ${PR_DESCRIPTION_CLOSE}

If you did not change any files, skip steps 1–6 entirely and do not emit the
blocks.
`.trim();
