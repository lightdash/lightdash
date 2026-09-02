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
 * package's AGENTS.md is the template author's own guidance and travels
 * verbatim: it is authoring guidance the builder can override, not an
 * enforcement mechanism. On the seeding build the agent is told to bind
 * the seeded app; on iterations only the guardrails remain.
 */
export const buildOrgTemplateInstructions = ({
    name,
    guardrails,
    seeded,
}: {
    name: string;
    guardrails: string | null;
    seeded: boolean;
}): string => {
    const header = seeded
        ? `[Template: ${name} — seeded organization template]
The workspace already contains the finished "${name}" app: components under src/ and a src/template.json manifest holding everything that is meant to vary (data bindings, parameters, labels, theme). Your job is to BIND this app to the user's request, not to rebuild it:
- Read src/template.json first. Resolve the user's request (and any clarification answers) against the real data models in /tmp/dbt-repo/models and set the manifest's bindings accordingly, using explore, metric, and dimension names exactly as declared in the YAML.
- Adjust parameters, labels, and theme in src/template.json. Do not rewrite the components or the manifest loader: the deterministic starting point is the feature. Touch component code only for behavior the manifest cannot express, and keep changes minimal.
- Verify every binding against the model YAML — a wrong field id fails loudly on the app page.`
        : `[Template: ${name} — organization template]
This app was built from the "${name}" template: its src/template.json manifest holds the data bindings, parameters, labels, and theme. Prefer manifest edits over component rewrites when the request can be expressed there.`;
    if (!guardrails || guardrails.trim().length === 0) {
        return header;
    }
    return `${header}

Template guardrails (from the template author's AGENTS.md):
${guardrails.trim()}`;
};
