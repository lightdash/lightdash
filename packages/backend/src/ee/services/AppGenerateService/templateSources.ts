import { type DataAppTemplateKind } from '@lightdash/common';

/**
 * Organization data app templates: uploaded packages whose source is seeded
 * into the sandbox so the agent binds the app (src/template.json edits
 * against the target project) instead of generating one. Built-in flavours
 * keep the instruction-pack flow in ./templates.
 */

/**
 * Seed only the first build of a fresh sandbox: iterations own their source,
 * and a resumed sandbox has `/app/src` restored from its snapshot — seeding
 * either would clobber user work.
 */
export const shouldSeedOrgTemplate = (context: {
    version: number;
    wasResumed: boolean;
}): boolean => context.version === 1 && !context.wasResumed;

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
}: {
    name: string;
    guardrails: string | null;
    seeded: boolean;
    kind?: DataAppTemplateKind;
    iteration?: boolean;
}): string => {
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
The workspace already contains the finished "${name}" app: components under src/ and a src/template.json manifest holding everything that is meant to vary (data bindings, parameters, labels, theme). Your job is to BIND this app to the user's request, not to rebuild it. In this build src/template.json is the only file you can write; component files are read-only.
- Read src/template.json first. Resolve the user's request (and any clarification answers) against the real data models in /tmp/dbt-repo/models and set the manifest's bindings accordingly, using explore, metric, and dimension names exactly as declared in the YAML.
- Adjust parameters, labels, and theme in src/template.json. Do not attempt to edit components or the manifest loader.
- If part of the request needs something the manifest cannot express, do not work around it: say plainly what this template supports, bind the rest, and tell the user they can ask for the extra behaviour in a follow-up message once the app is built.
- Verify every binding against the model YAML — a wrong field id fails loudly on the app page.`
        : `[Template: ${name} — organization template]
This app is an instance of the "${name}" template: its src/template.json manifest holds the data bindings, parameters, labels, and theme, and src/template.json is the only file you can write. Make the requested change there. If the request needs a component change, do not attempt it: explain that this app follows the template, that the change belongs to the template's author, and that the user can duplicate the app or start from scratch for a free copy.`;
    if (guidance.length === 0) {
        return header;
    }
    return `${header}

Template guardrails (from the template author's AGENTS.md):
${guidance}`;
};
