import {
    assertUnreachable,
    buildComposerVizConfig,
    ChartKind,
    DimensionType,
    getComposerCustomVizPool,
    getComposerCustomVizPools,
    getComposerCustomVizSelectedFields,
    getComposerFieldConfig,
    getComposerVizKind,
    getDataAppVizChartConfigErrors,
    isComposerCustomVizConfig,
    isComposerNumericColumn,
    isVizTableConfig,
    pruneDataAppVizOptionValues,
    VizAggregationOptions,
    type AllVizChartConfig,
    type AnyType,
    type ComposerChartKind,
    type ComposerCustomVizConfig,
    type ComposerVizConfig,
    type ComposerVizKind,
    type ComposerVizPlan,
    type CustomChartType,
    type DataAppVizConfigOption,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
    type ResultColumn,
    type ResultColumns,
    type SourceQuery,
} from '@lightdash/common';
import Logger from '../../../../logging/logger';
import type { DbAiPromptComposerVizDecision } from '../../../database/entities/ai';
import type {
    RecordPromptDecisionFn,
    ResolveCustomChartTypeFn,
} from '../types/aiAgentDependencies';
import type { AgentDecisionContext } from './agentQuestion';
import {
    AiDecisionClient,
    confidentChoice,
    decisionProbability,
    type AiDecisionUsage,
    type DecisionAnswers,
    type DecisionQuestion,
} from './AiDecisionClient';

export const VIZ_PLANNER_OPERATION =
    'composer-viz' satisfies DbAiPromptComposerVizDecision['operation'];
export const VIZ_PLANNER_THRESHOLDS = {
    kind: 0.6,
    x: 0.85,
    y: 0.85,
    groupBy: 0.85,
    explicitStyle: 0.85,
    slot: 0.85,
    slotMember: 0.6,
    option: 0.85,
} as const;

const KEEP = 'keep';
const NONE = 'none';
const MAX_COLUMNS = 30;
const MAX_SAMPLES = 5;
const MAX_SAMPLE_LENGTH = 40;
const MAX_SERIES = 12;
const ID_LIKE_SUFFIX = /(^|[_\s.])(id|uuid|key)$/i;
const ID_LIKE_CAMEL_SUFFIX = /[a-z](Id|Uuid|Key)$/;
const DEFAULT = 'default';
const MAX_CUSTOM_TYPES = 5;
const MAX_POOL = 30;

type BuiltInVizKind = Exclude<ComposerVizKind, 'custom'>;
type CustomKindKey = `custom:${string}`;
/** A built-in kind or an offered custom chart type, keyed by slug. */
export type VizPlannerKind = BuiltInVizKind | CustomKindKey;

const COMPOSER_VIZ_KINDS: BuiltInVizKind[] = [
    'table',
    'bar',
    'line',
    'pie',
    'big_number',
];

const customKindKey = (slug: string): CustomKindKey => `custom:${slug}`;

export type PlannedComposerViz = {
    vizConfig: ComposerVizConfig;
    /** The composer tool result line telling the agent what the artifact opens on. */
    note: string;
};

export type PlanComposerViz = (args: {
    title: string | null;
    description: string | null;
    terminalNode: { title: string | null; description: string | null };
    node: SourceQuery | null;
    columns: ResultColumns;
    rows: Record<string, AnyType>[];
    rowCount: number;
    enableDataAccess: boolean;
    previousVizConfig: ComposerVizConfig | null;
}) => Promise<PlannedComposerViz | null>;

type AskedOption = Extract<
    DataAppVizConfigOption,
    { type: 'select' | 'boolean' }
>;

/** A custom chart type every required slot of which the result can fill. */
export type OfferedCustomChartType = {
    key: CustomKindKey;
    type: CustomChartType;
    /** Result column ids each slot may bind, in pool order. */
    slots: { field: DataAppVizField; pool: string[] }[];
    /** Options Jev may set; other option types keep their defaults. */
    options: AskedOption[];
};

/** The previous viz config when it rendered an offered custom chart type. */
export type PreviousCustomViz = {
    key: CustomKindKey;
    vizConfig: ComposerCustomVizConfig;
};

/** Code-gated candidates the planner may pick from; Jev only chooses among them. */
export type VizPlannerShape = {
    columns: ResultColumn[];
    /** Kinds the result can render as; any other pick is unsupported. */
    supportedKinds: VizPlannerKind[];
    customTypes: OfferedCustomChartType[];
    xCandidates: string[];
    yCandidates: string[];
    pieCandidates: string[];
    /** Low-cardinality columns that can split bar/line into series. */
    groupByCandidates: string[];
};

const isNumeric = isComposerNumericColumn;

const numericValue = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const distinctKey = (value: unknown): string => {
    if (value instanceof Date) return `date:${value.toISOString()}`;
    if (typeof value === 'object' && value !== null)
        return `json:${JSON.stringify(value)}`;
    return `${typeof value}:${String(value)}`;
};

const sampleValue = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object' && value !== null)
        return JSON.stringify(value).slice(0, MAX_SAMPLE_LENGTH);
    if (typeof value === 'string') return value.slice(0, MAX_SAMPLE_LENGTH);
    return value;
};

const getColumnStats = (
    column: ResultColumn,
    rows: Record<string, AnyType>[],
) => {
    const values = rows.map((row) => row[column.reference]);
    const present = values.filter(
        (value) => value !== null && value !== undefined,
    );
    const distinct = new Map<string, unknown>();
    present.forEach((value) => {
        const key = distinctKey(value);
        if (!distinct.has(key)) distinct.set(key, value);
    });
    const integerOnly = isNumeric(column)
        ? column.numericKind?.kind === 'integer' ||
          (present.length > 0 &&
              present.every((value) => Number.isInteger(numericValue(value))))
        : false;
    return {
        distinctCount: distinct.size,
        integerOnly,
        nullShare:
            values.length === 0
                ? 0
                : Math.round((1 - present.length / values.length) * 100) / 100,
        samples: [...distinct.values()].slice(0, MAX_SAMPLES).map(sampleValue),
        hasDuplicates: distinct.size < present.length,
    };
};

const isIdLikeName = ({ reference, label }: ResultColumn) =>
    [reference, label ?? ''].some(
        (name) => ID_LIKE_SUFFIX.test(name) || ID_LIKE_CAMEL_SUFFIX.test(name),
    );

const isAskedOption = (
    option: DataAppVizConfigOption,
): option is AskedOption => {
    switch (option.type) {
        case 'boolean':
            return true;
        case 'select':
            return option.choices.every(
                (choice) =>
                    choice.value !== DEFAULT &&
                    choice.value !== KEEP &&
                    choice.value !== NONE,
            );
        case 'number':
        case 'text':
        case 'color':
        case 'gradient':
            return false;
        default:
            return assertUnreachable(option, 'Unknown config option type');
    }
};

/** Custom chart types whose every required slot has a result column to bind, in library order, capped. */
export const getOfferedCustomChartTypes = ({
    customChartTypes,
    columns,
    node,
    rowCount,
}: {
    customChartTypes: CustomChartType[];
    columns: ResultColumn[];
    node: SourceQuery | null;
    rowCount: number;
}): OfferedCustomChartType[] => {
    if (rowCount === 0) return [];
    const pools = getComposerCustomVizPools(columns, node);
    return customChartTypes
        .map((type) => ({
            key: customKindKey(type.slug),
            type,
            slots: type.schema.fields.map((field) => ({
                field,
                pool: getComposerCustomVizPool(pools, field.type).slice(
                    0,
                    MAX_POOL,
                ),
            })),
            options: type.schema.configOptions.filter(isAskedOption),
        }))
        .filter((offered) =>
            offered.slots.every(
                ({ field, pool }) => !field.required || pool.length > 0,
            ),
        )
        .slice(0, MAX_CUSTOM_TYPES);
};

/** Result shape for the planner: code-gated candidates plus the state Jev sees. */
export const getVizPlannerShape = ({
    columns: resultColumns,
    rows,
    rowCount,
    enableDataAccess,
    customChartTypes,
    node,
}: {
    columns: ResultColumns;
    rows: Record<string, AnyType>[];
    rowCount: number;
    enableDataAccess: boolean;
    customChartTypes: CustomChartType[];
    node: SourceQuery | null;
}): { shape: VizPlannerShape; state: object[] } => {
    const columns = Object.values(resultColumns)
        .filter(
            (column) => column.reference !== KEEP && column.reference !== NONE,
        )
        .slice(0, MAX_COLUMNS);
    const stats = new Map(
        columns.map((column) => [
            column.reference,
            getColumnStats(column, rows),
        ]),
    );
    const idLike = new Set(
        columns
            .filter((column) => {
                if (isIdLikeName(column)) return true;
                const columnStats = stats.get(column.reference);
                return (
                    enableDataAccess &&
                    isNumeric(column) &&
                    rowCount > 1 &&
                    columnStats?.integerOnly === true &&
                    columnStats.distinctCount === rowCount
                );
            })
            .map((column) => column.reference),
    );

    const numerics = columns.filter(isNumeric);
    const nonNumerics = columns.filter((column) => !isNumeric(column));
    const measures = numerics.filter((column) => !idLike.has(column.reference));
    const yCandidates = (measures.length > 0 ? measures : numerics).map(
        (column) => column.reference,
    );
    const xCandidates = (nonNumerics.length > 0 ? nonNumerics : numerics).map(
        (column) => column.reference,
    );
    const pieCandidates = columns
        .filter(
            (column) =>
                column.type === DimensionType.STRING &&
                stats.get(column.reference)?.hasDuplicates === false,
        )
        .map((column) => column.reference);
    const hasCartesian = xCandidates.some((x) =>
        yCandidates.some((y) => y !== x),
    );
    // Low cardinality needs row stats, so without data access nothing splits series.
    const groupByCandidates = nonNumerics
        .filter((column) => {
            if (!enableDataAccess) return false;
            const distinctCount = stats.get(column.reference)?.distinctCount;
            return distinctCount !== undefined && distinctCount <= MAX_SERIES;
        })
        .map((column) => column.reference)
        .filter((groupBy) => xCandidates.some((x) => x !== groupBy));

    const supportedKinds: VizPlannerKind[] = ['table'];
    if (rowCount > 0 && hasCartesian) supportedKinds.push('bar', 'line');
    if (rowCount > 0 && pieCandidates.length > 0 && yCandidates.length > 0)
        supportedKinds.push('pie');
    if (rowCount === 1 && yCandidates.length > 0)
        supportedKinds.push('big_number');
    const customTypes = getOfferedCustomChartTypes({
        customChartTypes,
        columns,
        node,
        rowCount,
    });
    supportedKinds.push(...customTypes.map((offered) => offered.key));

    const state = columns.map((column) => {
        const columnStats = stats.get(column.reference);
        return {
            reference: column.reference,
            type: column.type,
            ...(column.label ? { label: column.label } : {}),
            ...(enableDataAccess && columnStats
                ? {
                      distinctCount: columnStats.distinctCount,
                      integerOnly: columnStats.integerOnly,
                      idLike: idLike.has(column.reference),
                      nullShare: columnStats.nullShare,
                      samples: columnStats.samples,
                  }
                : {}),
        };
    });

    return {
        shape: {
            columns,
            supportedKinds,
            customTypes,
            xCandidates,
            yCandidates,
            pieCandidates,
            groupByCandidates,
        },
        state,
    };
};

type PreviousAxes = {
    x: string | null;
    y: string | null;
    groupBy: string | null;
};

const previousAxes = (previous: ComposerVizConfig | null): PreviousAxes => {
    if (
        !previous ||
        isComposerCustomVizConfig(previous) ||
        isVizTableConfig(previous)
    )
        return { x: null, y: null, groupBy: null };
    return {
        x: previous.fieldConfig?.x?.reference ?? null,
        y: previous.fieldConfig?.y[0]?.reference ?? null,
        groupBy: previous.fieldConfig?.groupBy?.[0]?.reference ?? null,
    };
};

const resolveColumn = (
    answer: DecisionAnswers[string] | undefined,
    candidates: string[],
    previous: string | null,
    threshold: number,
): string | null => {
    // A lone candidate is not asked about.
    if (!answer) return candidates.length === 1 ? candidates[0] : null;
    const choice = confidentChoice(answer, threshold);
    if (choice === KEEP)
        return previous !== null && candidates.includes(previous)
            ? previous
            : null;
    return choice !== null && candidates.includes(choice) ? choice : null;
};

/** Positive form of the identifier rule; `columns[].idLike` is in the state. */
const ID_RULE =
    'A column marked `idLike` in `columns` fits only when the question is about individual records.';

const KIND_DESCRIPTIONS: Record<BuiltInVizKind, string> = {
    table: 'A table of the rows: detailed records, many fields, or no chart that answers the question.',
    bar: 'Bars comparing one measure across categories, optionally split into series by another category.',
    line: 'A line of one measure over an ordered axis, usually time, optionally one line per category.',
    pie: 'A part-to-whole breakdown across a few nonnegative categories.',
    big_number: 'A single headline value.',
};

const slotSummary = ({ field }: OfferedCustomChartType['slots'][number]) =>
    `${field.label} (${[
        field.type,
        ...(field.multiple ? ['multiple'] : []),
        ...(field.required ? [] : ['optional']),
    ].join(', ')})`;

const sentence = (text: string) => {
    const trimmed = text.trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const customKindDescription = (offered: OfferedCustomChartType) =>
    `Custom chart "${offered.type.name}": ${sentence(
        offered.type.description,
    )} Slots: ${offered.slots.map(slotSummary).join('; ')}.`;

const slotQuestionId = (key: CustomKindKey, slot: string) =>
    `${key}:slot:${slot}`;
const slotMemberQuestionId = (
    key: CustomKindKey,
    slot: string,
    reference: string,
) => `${key}:slot:${slot}:${reference}`;
const optionQuestionId = (key: CustomKindKey, option: string) =>
    `${key}:option:${option}`;

/** A lone candidate for a required slot is bound without asking. */
const isSlotAsked = ({
    field,
    pool,
}: OfferedCustomChartType['slots'][number]) =>
    pool.length > 0 && !(field.required && pool.length === 1);

const previousSlotValue = (
    previous: PreviousCustomViz | null,
    key: CustomKindKey,
    slot: string,
): string | null => {
    if (previous?.key !== key) return null;
    const value = previous.vizConfig.fieldMapping[slot];
    return typeof value === 'string' ? value : null;
};

/** Branch questions per offered type, phrased on the premise the type is chosen; only the chosen branch is read. */
const getCustomQuestions = (
    offered: OfferedCustomChartType,
    labelOf: (reference: string) => string | null,
    previous: PreviousCustomViz | null,
): Record<string, DecisionQuestion> => {
    const premise = `If the custom chart type "${offered.type.name}" were chosen`;
    const questions: Record<string, DecisionQuestion> = {};
    offered.slots.filter(isSlotAsked).forEach((slot) => {
        const { field, pool } = slot;
        const slotText = `the ${field.type} slot "${field.label}"${
            field.description ? ` (${field.description})` : ''
        }`;
        if (field.multiple) {
            pool.forEach((reference) => {
                const label = labelOf(reference);
                questions[
                    slotMemberQuestionId(offered.key, field.name, reference)
                ] = {
                    type: 'noul',
                    instructions: `${premise}, does the column ${reference}${
                        label ? ` ("${label}")` : ''
                    } belong in ${slotText}? Yes for every column the question asks to show there. ${ID_RULE}`,
                };
            });
            return;
        }
        const keep = previousSlotValue(previous, offered.key, field.name);
        questions[slotQuestionId(offered.key, field.name)] = {
            type: 'choice',
            instructions: `${premise}, which column fills ${slotText}? Pick the column the question names for this role. ${ID_RULE}${
                field.required
                    ? ''
                    : ' Choose none to leave this optional slot empty.'
            }`,
            criteria: {
                ...Object.fromEntries(
                    pool.map((reference) => [reference, labelOf(reference)]),
                ),
                ...(field.required ? {} : { [NONE]: 'Leave the slot empty' }),
                ...(keep !== null && pool.includes(keep)
                    ? { [KEEP]: `Keep ${keep}` }
                    : {}),
            },
        };
    });
    offered.options.forEach((option) => {
        const id = optionQuestionId(offered.key, option.name);
        switch (option.type) {
            case 'select':
                questions[id] = {
                    type: 'choice',
                    instructions: `${premise}, which value should its option "${option.label}" take? Choose default unless \`question\` or \`conversation\` asks for a specific one.`,
                    criteria: {
                        ...Object.fromEntries(
                            option.choices.map((choice) => [
                                choice.value,
                                choice.label,
                            ]),
                        ),
                        [DEFAULT]: `Keep the default (${option.default})`,
                    },
                };
                break;
            case 'boolean':
                questions[id] = {
                    type: 'noul',
                    instructions: `${premise}, should its option "${option.label}" be on? It defaults to ${
                        option.default ? 'on' : 'off'
                    }; answer with that default unless \`question\` or \`conversation\` asks otherwise.`,
                };
                break;
            default:
                assertUnreachable(option, 'Unknown asked option type');
        }
    });
    return questions;
};

const getQuestions = (
    shape: VizPlannerShape,
    previous: PreviousAxes,
    previousCustom: PreviousCustomViz | null,
): Record<string, DecisionQuestion> => {
    const labelOf = (reference: string) =>
        shape.columns.find((column) => column.reference === reference)?.label ??
        null;
    const questions: Record<string, DecisionQuestion> = {
        kind: {
            type: 'choice',
            instructions:
                'Choose how the result is visualized to answer `question`, given `columns` and `rowCount`. An explicit visualization request in `question` or `conversation` wins, even for a kind outside `supportedKinds`. A custom chart type (`customChartTypes`) wins when its description, slots and inputGuidance fit the question better than a built-in kind. Keep every requested field visible. Choose none if unsure.',
            criteria: {
                ...Object.fromEntries(
                    COMPOSER_VIZ_KINDS.map((kind) => [
                        kind,
                        KIND_DESCRIPTIONS[kind],
                    ]),
                ),
                ...Object.fromEntries(
                    shape.customTypes.map((offered) => [
                        offered.key,
                        customKindDescription(offered),
                    ]),
                ),
                [NONE]: 'Unsure',
            },
        },
        explicitStyle: {
            type: 'noul',
            instructions:
                'Does `question` or `conversation` explicitly request a visualization kind: a table, bar, line, pie, single number or a named custom chart type?',
        },
        ...Object.fromEntries(
            shape.customTypes.flatMap((offered) =>
                Object.entries(
                    getCustomQuestions(offered, labelOf, previousCustom),
                ),
            ),
        ),
    };
    if (shape.xCandidates.length > 0) {
        questions.x = {
            type: 'choice',
            instructions: `Choose the column for the x-axis or pie categories: the time column for a trend, otherwise the grouping the question asks about. ${ID_RULE} Choose none if no column fits.`,
            criteria: {
                ...Object.fromEntries(
                    shape.xCandidates.map((reference) => [
                        reference,
                        labelOf(reference),
                    ]),
                ),
                [NONE]: 'No suitable axis',
                ...(previous.x ? { [KEEP]: `Keep ${previous.x}` } : {}),
            },
        };
    }
    const yCriteria = {
        ...Object.fromEntries(
            shape.yCandidates.map((reference) => [
                reference,
                labelOf(reference),
            ]),
        ),
        ...(previous.y ? { [KEEP]: `Keep ${previous.y}` } : {}),
    };
    if (Object.keys(yCriteria).length > 1) {
        questions.y = {
            type: 'choice',
            instructions: `Choose the measure the question asks about for the value axis. ${ID_RULE} A year used as a label is a category, not a measure.`,
            criteria: yCriteria,
        };
    }
    if (shape.groupByCandidates.length > 0) {
        questions.groupBy = {
            type: 'choice',
            instructions:
                'For a bar or line chart, choose the column that splits the measure into one series per value, such as region in "revenue by month by region". It must differ from the x-axis column. Choose none when the question asks for no breakdown or the rows have one value per x.',
            criteria: {
                ...Object.fromEntries(
                    shape.groupByCandidates.map((reference) => [
                        reference,
                        labelOf(reference),
                    ]),
                ),
                [NONE]: 'No series split',
                ...(previous.groupBy
                    ? { [KEEP]: `Keep ${previous.groupBy}` }
                    : {}),
            },
        };
    }
    return questions;
};

// A series split sums numeric values per x and series.
const fieldConfig = (
    kind: ComposerChartKind,
    x: ResultColumn | null,
    y: ResultColumn,
    groupBy: ResultColumn | null = null,
) =>
    getComposerFieldConfig(
        {
            x,
            y,
            seriesSplit: groupBy
                ? {
                      groupBy,
                      aggregation: isNumeric(y)
                          ? VizAggregationOptions.SUM
                          : VizAggregationOptions.ANY,
                  }
                : null,
        },
        kind,
    );

const resolveGroupBy = (
    answer: DecisionAnswers[string] | undefined,
    shape: VizPlannerShape,
    previous: string | null,
    columns: ResultColumns,
    exclude: string[],
): ResultColumn | null => {
    if (!answer) return null;
    const reference = resolveColumn(
        answer,
        shape.groupByCandidates,
        previous,
        VIZ_PLANNER_THRESHOLDS.groupBy,
    );
    if (reference === null || exclude.includes(reference)) return null;
    return columns[reference] ?? null;
};

const tableConfig = (columns: ResultColumn[]): AllVizChartConfig => ({
    type: ChartKind.TABLE,
    metadata: { version: 1 },
    columns: Object.fromEntries(
        columns.map((column) => [
            column.reference,
            {
                visible: true,
                reference: column.reference,
                label: column.label ?? column.reference,
                frozen: false,
            },
        ]),
    ),
    display: undefined,
});

const KIND_NAMES: Record<ComposerVizKind, string> = {
    table: 'table',
    bar: 'bar chart',
    line: 'line chart',
    pie: 'pie chart',
    big_number: 'big number',
    custom: 'custom chart',
};

const axesNote = (x: string | undefined, y: string | undefined) =>
    [...(x ? [`x = ${x}`] : []), ...(y ? [`y = ${y}`] : [])].join(', ');

/** The composer tool result line for the column-type default, when nothing was planned. */
export const getDefaultVizNote = ({ defaultKind, axes }: ComposerVizPlan) => {
    if (defaultKind === 'table') return 'Visualization: default table.';
    if (defaultKind === 'custom') return 'Visualization: default custom chart.';
    const defaultAxes = axes[defaultKind];
    const parts = axesNote(defaultAxes?.x?.reference, defaultAxes?.y.reference);
    return `Visualization: default ${KIND_NAMES[defaultKind]}${parts ? `, ${parts}` : ''}.`;
};

/** The composer tool result line for a custom chart type. */
export const getCustomVizConfigNote = (
    name: string,
    { fieldMapping }: ComposerCustomVizConfig,
) => {
    const parts = Object.entries(fieldMapping)
        .map(
            ([slot, value]) =>
                `${slot} = ${Array.isArray(value) ? value.join(', ') : value}`,
        )
        .join(', ');
    return `Visualization: custom chart "${name}"${parts ? `, ${parts}` : ''}.`;
};

/** The composer tool result line telling the agent what the artifact opens on. */
export const getVizConfigNote = (vizConfig: AllVizChartConfig) => {
    if (isVizTableConfig(vizConfig)) return 'Visualization: table.';
    const x = vizConfig.fieldConfig?.x?.reference;
    const y = vizConfig.fieldConfig?.y[0]?.reference;
    const groupBy = vizConfig.fieldConfig?.groupBy?.[0]?.reference;
    const parts = [
        ...(x ? [`x = ${x}`] : []),
        ...(y ? [`y = ${y}`] : []),
        ...(groupBy ? [`split by ${groupBy}`] : []),
    ].join(', ');
    return `Visualization: ${KIND_NAMES[getComposerVizKind(vizConfig)]}${parts ? `, ${parts}` : ''}.`;
};

/** The kind Jev picked when it is supported and confident, or explicitly requested; null otherwise. */
const getPickedKind = (
    answers: DecisionAnswers,
    shape: VizPlannerShape,
): VizPlannerKind | null => {
    const answeredKind =
        answers.kind?.type === 'choice' ? answers.kind.choice : null;
    const kind = shape.supportedKinds.find(
        (candidate) => candidate === answeredKind,
    );
    if (!kind) return null;
    // An explicit request takes a supported kind regardless of confidence.
    const explicit =
        (decisionProbability(answers.explicitStyle) ?? 0) >=
        VIZ_PLANNER_THRESHOLDS.explicitStyle;
    if (
        !explicit &&
        confidentChoice(answers.kind, VIZ_PLANNER_THRESHOLDS.kind) !== kind
    )
        return null;
    return kind;
};

const getBuiltInVizConfig = ({
    kind,
    answers,
    shape,
    columns,
    previousVizConfig,
}: {
    kind: BuiltInVizKind;
    answers: DecisionAnswers;
    shape: VizPlannerShape;
    columns: ResultColumns;
    previousVizConfig: ComposerVizConfig | null;
}): AllVizChartConfig | null => {
    if (kind === 'table') return tableConfig(Object.values(columns));

    const previous = previousAxes(previousVizConfig);
    const yReference = resolveColumn(
        answers.y,
        shape.yCandidates,
        previous.y,
        VIZ_PLANNER_THRESHOLDS.y,
    );
    const y = yReference === null ? undefined : columns[yReference];
    if (!y) return null;
    if (kind === 'big_number') {
        return buildComposerVizConfig({
            kind,
            fieldConfig: fieldConfig(kind, null, y),
        });
    }

    const xReference = resolveColumn(
        answers.x,
        kind === 'pie' ? shape.pieCandidates : shape.xCandidates,
        previous.x,
        VIZ_PLANNER_THRESHOLDS.x,
    );
    const x = xReference === null ? undefined : columns[xReference];
    if (!x || x.reference === y.reference) return null;
    // Pie never stores a series split.
    const groupBy =
        kind === 'pie'
            ? null
            : resolveGroupBy(
                  answers.groupBy,
                  shape,
                  previous.groupBy,
                  columns,
                  [x.reference, y.reference],
              );
    return buildComposerVizConfig({
        kind,
        fieldConfig: fieldConfig(kind, x, y, groupBy),
    });
};

type SlotBinding =
    | { status: 'bound'; value: string | string[] }
    | { status: 'empty' }
    | { status: 'unresolved' };

const resolveSlot = (
    answers: DecisionAnswers,
    offered: OfferedCustomChartType,
    slot: OfferedCustomChartType['slots'][number],
    order: string[],
    previous: PreviousCustomViz | null,
): SlotBinding => {
    const { field, pool } = slot;
    const missing: SlotBinding = field.required
        ? { status: 'unresolved' }
        : { status: 'empty' };
    if (pool.length === 0) return missing;
    if (!isSlotAsked(slot)) {
        return { status: 'bound', value: field.multiple ? [pool[0]] : pool[0] };
    }
    if (field.multiple) {
        const members = pool
            .filter(
                (reference) =>
                    (decisionProbability(
                        answers[
                            slotMemberQuestionId(
                                offered.key,
                                field.name,
                                reference,
                            )
                        ],
                    ) ?? 0) >= VIZ_PLANNER_THRESHOLDS.slotMember,
            )
            .sort((a, b) => order.indexOf(a) - order.indexOf(b));
        return members.length > 0
            ? { status: 'bound', value: members }
            : missing;
    }
    const answer = answers[slotQuestionId(offered.key, field.name)];
    if (
        !field.required &&
        confidentChoice(answer, VIZ_PLANNER_THRESHOLDS.slot) === NONE
    )
        return { status: 'empty' };
    const reference = resolveColumn(
        answer,
        pool,
        previousSlotValue(previous, offered.key, field.name),
        VIZ_PLANNER_THRESHOLDS.slot,
    );
    return reference === null ? missing : { status: 'bound', value: reference };
};

const resolveOptionValues = (
    answers: DecisionAnswers,
    offered: OfferedCustomChartType,
    previous: PreviousCustomViz | null,
): DataAppVizOptionValues => {
    // Options Jev leaves unsure keep the previous value for the same type.
    const values: DataAppVizOptionValues =
        previous?.key === offered.key
            ? pruneDataAppVizOptionValues(
                  offered.type.schema.configOptions,
                  previous.vizConfig.optionValues,
              )
            : {};
    const set = (option: AskedOption, value: string | boolean) => {
        if (value === option.default) delete values[option.name];
        else values[option.name] = value;
    };
    offered.options.forEach((option) => {
        const answer = answers[optionQuestionId(offered.key, option.name)];
        switch (option.type) {
            case 'select': {
                const choice = confidentChoice(
                    answer,
                    VIZ_PLANNER_THRESHOLDS.option,
                );
                if (choice === DEFAULT) set(option, option.default);
                else if (
                    choice !== null &&
                    option.choices.some(
                        (candidate) => candidate.value === choice,
                    )
                )
                    set(option, choice);
                break;
            }
            case 'boolean': {
                const probability = decisionProbability(answer);
                if (probability === null) break;
                if (probability >= VIZ_PLANNER_THRESHOLDS.option)
                    set(option, true);
                else if (probability <= 1 - VIZ_PLANNER_THRESHOLDS.option)
                    set(option, false);
                break;
            }
            default:
                assertUnreachable(option, 'Unknown asked option type');
        }
    });
    return values;
};

const getCustomVizConfig = async ({
    offered,
    answers,
    columns,
    node,
    previousCustom,
    resolveCustomChartType,
}: {
    offered: OfferedCustomChartType;
    answers: DecisionAnswers;
    columns: ResultColumns;
    node: SourceQuery | null;
    previousCustom: PreviousCustomViz | null;
    resolveCustomChartType: ResolveCustomChartTypeFn;
}): Promise<ComposerCustomVizConfig | null> => {
    const order = Object.keys(columns);
    const fieldMapping: DataAppVizFieldMapping = {};
    const unresolved = offered.slots.some((slot) => {
        const binding = resolveSlot(
            answers,
            offered,
            slot,
            order,
            previousCustom,
        );
        if (binding.status === 'bound')
            fieldMapping[slot.field.name] = binding.value;
        return binding.status === 'unresolved';
    });
    if (unresolved) return null;
    const optionValues = resolveOptionValues(answers, offered, previousCustom);
    const resolved = await resolveCustomChartType(offered.type.slug);
    if (!resolved) return null;
    const errors = getDataAppVizChartConfigErrors(
        { fieldMapping, optionValues },
        resolved.schema,
        getComposerCustomVizSelectedFields(Object.values(columns), node),
    );
    if (errors.length > 0) return null;
    return {
        type: ChartKind.DATA_APP_VIZ,
        metadata: { version: 1 },
        dataAppVizUuid: resolved.dataAppVizUuid,
        dataAppVizVersion: resolved.dataAppVizVersion,
        fieldMapping,
        optionValues,
    };
};

/** Applies the planner policy to Jev's answers; null when any pick is unsure, unsupported or invalid. */
export const getVizConfigFromAnswers = async ({
    answers,
    shape,
    columns,
    node,
    previousVizConfig,
    previousCustom,
    resolveCustomChartType,
}: {
    answers: DecisionAnswers;
    shape: VizPlannerShape;
    columns: ResultColumns;
    node: SourceQuery | null;
    previousVizConfig: ComposerVizConfig | null;
    previousCustom: PreviousCustomViz | null;
    resolveCustomChartType: ResolveCustomChartTypeFn;
}): Promise<PlannedComposerViz | null> => {
    const kind = getPickedKind(answers, shape);
    if (kind === null) return null;
    const offered = shape.customTypes.find(
        (candidate) => candidate.key === kind,
    );
    if (offered) {
        const vizConfig = await getCustomVizConfig({
            offered,
            answers,
            columns,
            node,
            previousCustom,
            resolveCustomChartType,
        });
        return vizConfig
            ? {
                  vizConfig,
                  note: getCustomVizConfigNote(offered.type.name, vizConfig),
              }
            : null;
    }
    const builtIn = COMPOSER_VIZ_KINDS.find((candidate) => candidate === kind);
    if (!builtIn) return null;
    const vizConfig = getBuiltInVizConfig({
        kind: builtIn,
        answers,
        shape,
        columns,
        previousVizConfig,
    });
    return vizConfig ? { vizConfig, note: getVizConfigNote(vizConfig) } : null;
};

/** The previous custom config when it renders one of the offered types. */
const getPreviousCustom = async (
    previousVizConfig: ComposerVizConfig | null,
    customTypes: OfferedCustomChartType[],
    resolveCustomChartType: ResolveCustomChartTypeFn,
): Promise<PreviousCustomViz | null> => {
    if (!previousVizConfig || !isComposerCustomVizConfig(previousVizConfig))
        return null;
    const resolved = await Promise.all(
        customTypes.map((offered) => resolveCustomChartType(offered.type.slug)),
    );
    const index = resolved.findIndex(
        (type) => type?.dataAppVizUuid === previousVizConfig.dataAppVizUuid,
    );
    return index === -1
        ? null
        : { key: customTypes[index].key, vizConfig: previousVizConfig };
};

const customTypeState = (offered: OfferedCustomChartType) => ({
    slug: offered.type.slug,
    name: offered.type.name,
    description: offered.type.description,
    inputGuidance: offered.type.schema.inputGuidance ?? null,
    slots: offered.slots.map(({ field }) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        multiple: field.multiple ?? false,
        description: field.description ?? null,
        examples: field.examples ?? null,
    })),
});

const previousVizState = (
    previousVizConfig: ComposerVizConfig | null,
    previous: PreviousAxes,
    previousCustom: PreviousCustomViz | null,
) => {
    if (!previousVizConfig) return null;
    if (isComposerCustomVizConfig(previousVizConfig)) {
        return {
            kind: previousCustom?.key ?? 'custom',
            fieldMapping: previousVizConfig.fieldMapping,
            optionValues: previousVizConfig.optionValues,
        };
    }
    return { kind: getComposerVizKind(previousVizConfig), ...previous };
};

export const createVizPlanner =
    ({
        decisions,
        question,
        conversation,
        usage,
        recordDecision,
        customChartTypes,
        resolveCustomChartType,
    }: {
        decisions: Pick<AiDecisionClient, 'evaluate'>;
        question: string;
        /** Carries the agent instructions. */
        conversation?: AgentDecisionContext;
        usage?: Pick<AiDecisionUsage, 'serviceMs'>;
        recordDecision?: RecordPromptDecisionFn;
        customChartTypes: CustomChartType[];
        resolveCustomChartType: ResolveCustomChartTypeFn;
    }): PlanComposerViz =>
    async ({
        title,
        description,
        terminalNode,
        node,
        columns,
        rows,
        rowCount,
        enableDataAccess,
        previousVizConfig,
    }) => {
        const startedAt = performance.now();
        const serviceMsBefore = usage?.serviceMs ?? null;
        let answers: DecisionAnswers | null = null;
        let planned: PlannedComposerViz | null = null;
        let outcome: DbAiPromptComposerVizDecision['outcome'] = 'unavailable';
        try {
            const { shape, state } = getVizPlannerShape({
                columns,
                rows,
                rowCount,
                enableDataAccess,
                customChartTypes,
                node,
            });
            if (shape.supportedKinds.length === 1) {
                // Only the table fits: nothing for Jev to decide.
                const vizConfig = tableConfig(Object.values(columns));
                planned = { vizConfig, note: getVizConfigNote(vizConfig) };
                outcome = 'planned';
            } else if (question.trim()) {
                const previous = previousAxes(previousVizConfig);
                const previousCustom = await getPreviousCustom(
                    previousVizConfig,
                    shape.customTypes,
                    resolveCustomChartType,
                );
                answers = await decisions.evaluate({
                    operation: VIZ_PLANNER_OPERATION,
                    state: {
                        question,
                        conversation,
                        artifact: { title, description },
                        terminalNode,
                        previousVizConfig: previousVizState(
                            previousVizConfig,
                            previous,
                            previousCustom,
                        ),
                        supportedKinds: shape.supportedKinds,
                        customChartTypes:
                            shape.customTypes.map(customTypeState),
                        rowCount,
                        columns: state,
                    },
                    questions: getQuestions(shape, previous, previousCustom),
                });
                planned = answers
                    ? await getVizConfigFromAnswers({
                          answers,
                          shape,
                          columns,
                          node,
                          previousVizConfig,
                          previousCustom,
                          resolveCustomChartType,
                      })
                    : null;
                if (answers) outcome = planned ? 'planned' : 'unresolved';
            }
        } catch (error) {
            Logger.warn(`Composer viz planner failed: ${String(error)}`);
            planned = null;
            outcome = 'unavailable';
        }
        const serviceMsAfter = usage?.serviceMs ?? null;
        await recordDecision?.({
            operation: VIZ_PLANNER_OPERATION,
            outcome,
            intent: planned ? { vizConfig: planned.vizConfig } : null,
            applied: planned !== null,
            answers,
            thresholds: VIZ_PLANNER_THRESHOLDS,
            latency_ms: Math.round(performance.now() - startedAt),
            jev_service_ms:
                serviceMsAfter === null
                    ? null
                    : Math.round(serviceMsAfter - (serviceMsBefore ?? 0)),
        });
        return planned;
    };
