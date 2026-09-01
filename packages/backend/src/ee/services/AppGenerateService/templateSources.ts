import { type DataAppTemplate } from '@lightdash/common';
import {
    FORECASTER_SOURCE_FILES,
    type TemplateSourceFile,
} from './templateSources/forecasterSource.generated';
import { SCORECARD_SOURCE_FILES } from './templateSources/scorecardSource.generated';

export { type TemplateSourceFile };

/**
 * Starter source per template. A template WITH source generates
 * deterministically: the sandbox is seeded with these files (on top of the
 * image's scaffold) and the agent's job flips from generating an app to
 * binding this one — editing `src/template.json` (explores, metrics, labels,
 * theme) against the target project. Templates without source keep the
 * instruction-pack flow. Org-scoped sources (save-app-as-template) later
 * arrive through this same lookup, loaded from per-org storage instead of a
 * generated module.
 */
const TEMPLATE_SOURCES: Partial<Record<DataAppTemplate, TemplateSourceFile[]>> =
    {
        forecaster: FORECASTER_SOURCE_FILES,
        scorecard: SCORECARD_SOURCE_FILES,
    };

export const getTemplateSource = (
    template: DataAppTemplate,
): TemplateSourceFile[] | null => TEMPLATE_SOURCES[template] ?? null;

/**
 * Seed only the first build of a fresh sandbox: iterations own their source,
 * and a resumed sandbox has `/app/src` restored from its snapshot — seeding
 * either would clobber user work.
 */
export const shouldSeedTemplateSource = (
    template: DataAppTemplate | undefined,
    context: { version: number; wasResumed: boolean },
): boolean =>
    template !== undefined &&
    TEMPLATE_SOURCES[template] !== undefined &&
    context.version === 1 &&
    !context.wasResumed;

const FORECASTER_BIND_INSTRUCTIONS = `[Template: Forecaster — seeded starter]
The workspace already contains the finished Forecaster app: components under src/ and a src/template.json manifest holding everything that is meant to vary — the explore/metric bindings, scenario parameters, labels, and theme. Your job is to BIND this app to the user's request, not to rebuild it:
- Read src/template.json first. Then resolve the user's request (and any clarification answers) against the real data models in /tmp/dbt-repo/models: pick the explore, the month-grain time dimension, and the metric being forecast, and set bindings.history accordingly. Bind bindings.history.ceilingMetric only when the user names a limit (committed spend, budget, capacity); otherwise leave it null.
- Set how far ahead to project in parameters.horizon.months (the template is monthly by design; do not re-grain it). Update labels (title, series label, lever copy, unit) and, if the user asks for a look, theme.vars — all in src/template.json.
- Do not rewrite the components, the forecast methodology, or src/template.js: the deterministic starting point is the feature. Touch component code only when the user explicitly asks for behavior the manifest cannot express, and keep changes minimal.
- Keep the governance language (plan summary traceability, footer) intact.
- Verify your bindings against the model YAML — a wrong field id fails loudly on the app page.`;

const SCORECARD_BIND_INSTRUCTIONS = `[Template: KPI Scorecard — seeded starter]
The workspace already contains the finished KPI Scorecard app: components under src/ and a src/template.json manifest holding everything that is meant to vary. Your job is to BIND this app to the user's request, not to rebuild it:
- Read src/template.json first. The scorecard is defined by bindings.tiles — an ordered list where each tile names an explore, the metric to show, the base time dimension used for the period window (day grain is derived as <timeDimension>_day), a label, a unit ({kind: currency|number|percent, symbol}), and an optional numeric target.
- Resolve the user's request (and any clarification answers) against the real data models in /tmp/dbt-repo/models: add, remove, reorder, or retarget tiles so the scorecard shows the metrics they asked for. Use metric keys and dimension names exactly as declared in the YAML; every tile's timeDimension must be a date/timestamp dimension on that tile's explore.
- Set targets only when the user states them. Adjust parameters.period options/default and comparison, and labels (title, eyebrow, tagline, control copy), in src/template.json. Theme via theme.vars only if a look is requested.
- Do not rewrite the components or src/template.js: the deterministic starting point is the feature. Touch component code only for behavior the manifest cannot express, and keep changes minimal.
- Verify every explore/metric/dimension against the model YAML — a wrong id fails loudly on the app page.`;

const TEMPLATE_BIND_INSTRUCTIONS: Partial<Record<DataAppTemplate, string>> = {
    forecaster: FORECASTER_BIND_INSTRUCTIONS,
    scorecard: SCORECARD_BIND_INSTRUCTIONS,
};

/**
 * Instructions used in place of the template's generation instructions when
 * the sandbox was seeded with starter source.
 */
export const getTemplateBindInstructions = (
    template: DataAppTemplate,
): string | null => TEMPLATE_BIND_INSTRUCTIONS[template] ?? null;
