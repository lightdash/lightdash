import { type DataAppTemplateKind } from '@lightdash/common';
import type { CodingAgentEditScope } from './claudeAllowedTools';

/**
 * Organization data app templates: uploaded packages whose source is seeded
 * into the sandbox so the agent binds the app (src/template.json edits
 * against the target project) instead of generating one. Built-in flavours
 * keep the instruction-pack flow in ./templates.
 */

/**
 * Seed the first build of a seeded template. Iterations own their source
 * (the sandbox restores `/app/src` from the app's snapshot), so seeding one
 * would clobber user work. A retried first build re-seeds even when its
 * sandbox was resumed: the catalog stage only runs while generation has not
 * started, so re-extracting the tar is safe, and it is the only way a crash
 * before seeding still ends in a seeded app. The kind comes from the app row
 * (pinned at creation), not from the template's current files.
 */
export const shouldSeedOrgTemplate = (context: {
    version: number;
    kind: DataAppTemplateKind;
}): boolean => context.version === 1 && context.kind === 'seeded';

/**
 * What the coding agent may write for an app built from an org template,
 * from the kind pinned on the app row. Seeded-template apps stay instances
 * of their template on every version, so the manifest is the only writable
 * file; instructions-only templates and apps without a template write
 * anywhere in src. Deriving this from the row (not from a pipeline stage)
 * keeps it true on retries that resume past the catalog stage.
 */
export const orgTemplateEditScope = (
    kind: DataAppTemplateKind | null | undefined,
): CodingAgentEditScope => (kind === 'seeded' ? 'manifest' : 'source');

/**
 * Appended to the build-fix prompt when the fixer can only write the
 * manifest: a component that fails to compile is the template author's to
 * repair, so the agent should say so instead of thrashing on files it
 * cannot touch.
 */
export const orgTemplateBuildFixNote = (
    editScope: CodingAgentEditScope,
): string =>
    editScope === 'manifest'
        ? ` This app is an instance of an organization template and src/template.json is the only file you can write. If the failure is in the manifest (a wrong binding, an invalid value), fix it there. If the failure is in a component, do not try to work around it: state plainly that the template's code does not build and that its author needs to fix it.`
        : '';

/**
 * Prompt block for an app built from an organization template. The
 * package's AGENTS.md is the template author's own text and travels
 * verbatim: it is authoring guidance the builder can override, not an
 * enforcement mechanism.
 *
 * Seeded templates: on the seeding build the agent is told to bind the
 * seeded app; on iterations only the guardrails remain. Instructions-only
 * templates have no source, so AGENTS.md is the build instruction itself,
 * the org-authored counterpart of a built-in flavour.
 */
export const buildOrgTemplateInstructions = ({
    name,
    guardrails,
    seeded,
    kind = 'seeded',
    iteration = false,
    enforced = true,
}: {
    name: string;
    guardrails: string | null;
    seeded: boolean;
    kind?: DataAppTemplateKind;
    iteration?: boolean;
    /**
     * Whether the manifest-only scope is enforced by the agent's tool
     * permissions (Claude) or only asked for (Codex keeps its own sandbox
     * policy). The prompt must not claim a restriction that does not exist:
     * the agent would either refuse valid work or break it silently.
     */
    enforced?: boolean;
}): string => {
    const manifestOnly = enforced
        ? 'src/template.json is the only file you can write; component files are read-only'
        : 'edit only src/template.json and leave component files untouched';
    const guidance = guardrails?.trim() ?? '';
    if (kind === 'instructions') {
        const header = iteration
            ? `[Template: ${name} — organization template]
This app was built from the "${name}" template. Keep to the template author's instructions below while making the requested change.`
            : `[Template: ${name} — organization template]
Build the app the template author describes below. These instructions define the app; resolve the user's request and any clarification answers within them.`;
        return guidance.length > 0
            ? `${header}

Template instructions (from the template author's AGENTS.md):
${guidance}`
            : header;
    }
    const header = seeded
        ? `[Template: ${name} — seeded organization template]
The workspace already contains the finished "${name}" app: components under src/ and a src/template.json manifest holding everything that is meant to vary (data bindings, parameters, labels, theme). Your job is to BIND this app to the user's request, not to rebuild it. In this build ${manifestOnly}.
- Read src/template.json first. Resolve the user's request (and any clarification answers) against the real data models in /tmp/dbt-repo/models and set the manifest's bindings accordingly, using explore, metric, and dimension names exactly as declared in the YAML.
- Adjust parameters, labels, and theme in src/template.json. Do not attempt to edit components or the manifest loader.
- If part of the request needs something the manifest cannot express, do not work around it: say plainly what this template supports, bind the rest, and tell the user they can ask for the extra behaviour in a follow-up message once the app is built.
- Verify every binding against the model YAML — a wrong field id fails loudly on the app page.`
        : `[Template: ${name} — organization template]
This app is an instance of the "${name}" template: its src/template.json manifest holds the data bindings, parameters, labels, and theme, and ${manifestOnly}. Make the requested change there. If the request needs a component change, do not attempt it: explain that this app follows the template, that the change belongs to the template's author, and that the user can duplicate the app or start from scratch for a free copy.`;
    if (guidance.length === 0) {
        return header;
    }
    return `${header}

Template guardrails (from the template author's AGENTS.md):
${guidance}`;
};
