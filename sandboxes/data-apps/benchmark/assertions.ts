/**
 * Behavioral rubric over one benchmark run: transcript-shape rules (does the
 * model follow the skill's workflow contract) plus mechanical quality gates
 * on the generated source. Every rule is a boolean; the runner aggregates
 * pass rates across repetitions — a rule that holds in 5/5 runs is working,
 * one that flips per run isn't.
 */
import type { StreamAnalysis } from './stream.ts';

/**
 * Generation template, mirroring the backend's `DataAppTemplate`. A template
 * adds its instructions to the prompt and, for a viz, collects the run's
 * declaration as CLI structured output.
 */
export type PromptTemplate = 'data_app_viz';

export type PromptSpec = {
    id: string;
    prompt: string;
    /** Absent = today's behaviour: no template instructions, no declaration. */
    template?: PromptTemplate;
    prepend?: string;
    sandboxFiles?: Record<string, string>;
    mustRead: string[];
    mustNotRead: string[];
};

export type RuleResults = Record<string, boolean>;

const PLACEHOLDER_MARKER = 'Lightdash Data App Placeholder';
const MAX_FILE_LINES = 350;

const inputPath = (input: Record<string, unknown>): string =>
    String(input.file_path ?? '');

/**
 * The Claude CLI executes read-only Bash (find/cat/grep/ls) in the sandbox
 * regardless of --allowedTools, so exploration via Bash is a fact of life,
 * not a violation. What the rubric flags is Bash that can MUTATE state or
 * run arbitrary programs — anything beyond `pnpm check` and plain file
 * inspection.
 */
const isMutatingBash = (command: string): boolean => {
    if (command.startsWith('pnpm check')) return false;
    return /\b(mkdir|cp|mv|rm|touch|tee|chmod|chown|ln|sed\s+-i|npm|npx|node|pnpm)\b/.test(
        command,
    );
};

/** Rules derived from the transcript alone. */
export function transcriptRules(
    analysis: StreamAnalysis,
    spec: PromptSpec,
): RuleResults {
    const writes = analysis.toolCalls.filter((t) => t.name === 'Write');
    const reads = analysis.toolCalls.filter((t) => t.name === 'Read');
    const bashes = analysis.toolCalls.filter((t) => t.name === 'Bash');

    const writtenPaths: string[] = [];
    let rewrote = false;
    for (const w of writes) {
        const p = inputPath(w.input);
        if (writtenPaths.includes(p)) rewrote = true;
        writtenPaths.push(p);
    }

    const readPaths = reads.map((r) => inputPath(r.input));
    const readBack = analysis.toolCalls.some((t, i) => {
        if (t.name !== 'Read') return false;
        const p = inputPath(t.input);
        return analysis.toolCalls
            .slice(0, i)
            .some(
                (prev) =>
                    (prev.name === 'Write' || prev.name === 'Edit') &&
                    inputPath(prev.input) === p,
            );
    });

    return {
        // Multi-file / no-monolith contract
        'no-rewrite-of-written-file': !rewrote,
        'no-read-back-of-own-writes': !readBack,
        // A viz is ONE component by contract, so the no-monolith rule doesn't
        // apply to it — omitted rather than failed.
        ...(spec.template === 'data_app_viz'
            ? {}
            : { 'multiple-source-files': writtenPaths.length >= 2 }),
        // Template-lib cheat sheet: those files are documented — neither Read
        // nor inspected via Bash (cat/sed/grep on src/lib counts too)
        'no-template-lib-reads':
            !readPaths.some((p) => p.startsWith('/app/src/lib/')) &&
            !bashes.some((b) =>
                String(b.input.command ?? '').includes('src/lib'),
            ),
        // Verification loop ran; Bash never mutated state or ran programs
        // beyond `pnpm check` (read-only exploration is tolerated — the CLI
        // executes it regardless of --allowedTools)
        'ran-pnpm-check': bashes.some((b) =>
            String(b.input.command ?? '').startsWith('pnpm check'),
        ),
        'no-mutating-bash': bashes.every(
            (b) => !isMutatingBash(String(b.input.command ?? '')),
        ),
        'no-denied-tools': analysis.deniedTools.length === 0,
        // Progressive disclosure discipline
        'reads-required-references': spec.mustRead.every((p) =>
            readPaths.includes(p),
        ),
        'skips-irrelevant-references': !spec.mustNotRead.some((p) =>
            readPaths.includes(p),
        ),
    };
}

/**
 * Mechanical quality gates on the downloaded /app/src tree
 * (path → file content).
 */
export function sourceRules(files: Record<string, string>): RuleResults {
    const sourceFiles = Object.entries(files).filter(
        ([p]) =>
            /\.(jsx|tsx|js|ts)$/.test(p) &&
            !p.includes('/lib/') &&
            !p.includes('/components/ui/'),
    );

    const appEntry = Object.entries(files).find(([p]) =>
        /src\/App\.(jsx|tsx)$/.test(p),
    );

    let axesOk = true;
    for (const [, content] of sourceFiles) {
        for (const match of content.matchAll(/<([XY]Axis)\b/g)) {
            const start = match.index ?? 0;
            const end = content.indexOf('>', start);
            const tag = content.slice(start, end === -1 ? undefined : end + 1);
            if (!/tickFormatter|hide/.test(tag)) {
                axesOk = false;
            }
        }
    }

    const oversized = sourceFiles.filter(
        ([, content]) => content.split('\n').length > MAX_FILE_LINES,
    );

    return {
        'not-placeholder-app': appEntry
            ? !appEntry[1].includes(PLACEHOLDER_MARKER)
            : false,
        'no-oversized-files': oversized.length === 0,
        'axes-have-tick-formatters': axesOk,
    };
}

// ---------------------------------------------------------------------------
// Data app viz
// ---------------------------------------------------------------------------

/**
 * The generation run's structured output (the viz declaration the backend
 * persists to `app_versions.viz_schema`), narrowed to what the rubric reads:
 * fields and option defaults needed by the render fixture. This deliberately
 * checks only declaration structure; whether generated code actually reacts to
 * the context is measured by the browser render gate.
 */
export type VizDeclaration = {
    fields: {
        name: string;
        label: string;
        type: 'dimension' | 'metric' | 'series';
        required: boolean;
    }[];
    configOptions: {
        name: string;
        type: 'boolean' | 'select' | 'number' | 'text' | 'color';
        default: boolean | number | string;
    }[];
    /** Null when the run declared no palette, or declared it as null. */
    colorPalette: { group?: string } | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const FIELD_TYPES = new Set(['dimension', 'metric', 'series']);
const OPTION_TYPES = new Set(['boolean', 'select', 'number', 'text', 'color']);

const hasUniqueNames = (entries: { name: string }[]): boolean =>
    new Set(entries.map(({ name }) => name)).size === entries.length;

const hasValidOptionBase = (
    option: Record<string, unknown>,
): option is Record<string, unknown> & {
    name: string;
    label: string;
    group?: string;
    type: string;
} =>
    typeof option.name === 'string' &&
    option.name.length > 0 &&
    typeof option.label === 'string' &&
    (option.group === undefined || typeof option.group === 'string') &&
    typeof option.type === 'string' &&
    OPTION_TYPES.has(option.type);

const hasValidSelectChoices = (value: unknown): boolean =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
        (choice) =>
            isRecord(choice) &&
            typeof choice.value === 'string' &&
            typeof choice.label === 'string',
    );

const hasValidOptionValueShape = (option: Record<string, unknown>): boolean => {
    switch (option.type) {
        case 'boolean':
            return typeof option.default === 'boolean';
        case 'select':
            return (
                typeof option.default === 'string' &&
                hasValidSelectChoices(option.choices)
            );
        case 'number':
            return (
                typeof option.default === 'number' &&
                Number.isFinite(option.default) &&
                (option.min === undefined ||
                    (typeof option.min === 'number' &&
                        Number.isFinite(option.min))) &&
                (option.max === undefined ||
                    (typeof option.max === 'number' &&
                        Number.isFinite(option.max)))
            );
        case 'text':
        case 'color':
            return typeof option.default === 'string';
        default:
            return false;
    }
};

export function parseVizDeclaration(value: unknown): VizDeclaration | null {
    if (!isRecord(value)) return null;
    if (!Array.isArray(value.fields) || !Array.isArray(value.configOptions)) {
        return null;
    }

    const fields: VizDeclaration['fields'] = [];
    for (const field of value.fields) {
        if (
            !isRecord(field) ||
            typeof field.name !== 'string' ||
            field.name.length === 0 ||
            typeof field.label !== 'string' ||
            typeof field.type !== 'string' ||
            !FIELD_TYPES.has(field.type) ||
            typeof field.required !== 'boolean'
        ) {
            return null;
        }
        fields.push({
            name: field.name,
            label: field.label,
            type: field.type as VizDeclaration['fields'][number]['type'],
            required: field.required,
        });
    }

    const configOptions: VizDeclaration['configOptions'] = [];
    for (const option of value.configOptions) {
        if (
            !isRecord(option) ||
            !hasValidOptionBase(option) ||
            !hasValidOptionValueShape(option)
        ) {
            return null;
        }
        configOptions.push({
            name: option.name,
            type: option.type as VizDeclaration['configOptions'][number]['type'],
            default: option.default as boolean | number | string,
        });
    }

    if (!hasUniqueNames(fields) || !hasUniqueNames(configOptions)) return null;

    const declared = value.colorPalette;
    if (declared !== null && !isRecord(declared)) return null;
    if (
        isRecord(declared) &&
        declared.group !== undefined &&
        typeof declared.group !== 'string'
    ) {
        return null;
    }
    const colorPalette = isRecord(declared)
        ? typeof declared.group === 'string'
            ? { group: declared.group }
            : {}
        : null;
    return { fields, configOptions, colorPalette };
}

/**
 * Objective declaration checks for a data-app-viz generation. These make no
 * claim about how the source uses the declaration; the render gate owns that
 * behavioral check by pushing a real context into the built component.
 */
export function vizDeclarationRules(
    declaration: VizDeclaration | null,
): RuleResults {
    return {
        'emits-valid-viz-declaration': declaration !== null,
        'declares-fields': (declaration?.fields.length ?? 0) > 0,
        'declares-config-options': (declaration?.configOptions.length ?? 0) > 0,
        'declares-color-palette': declaration?.colorPalette != null,
    };
}
