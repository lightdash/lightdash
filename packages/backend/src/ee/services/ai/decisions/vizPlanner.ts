import {
    buildComposerVizConfig,
    ChartKind,
    DimensionType,
    getComposerFieldConfig,
    getComposerVizKind,
    isComposerNumericColumn,
    isVizTableConfig,
    type AllVizChartConfig,
    type AnyType,
    type ComposerVizKind,
    type ComposerVizPlan,
    type ResultColumn,
    type ResultColumns,
} from '@lightdash/common';
import Logger from '../../../../logging/logger';
import type { DbAiPromptComposerVizDecision } from '../../../database/entities/ai';
import type { RecordPromptDecisionFn } from '../types/aiAgentDependencies';
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
    explicitStyle: 0.85,
} as const;

const KEEP = 'keep';
const NONE = 'none';
const MAX_COLUMNS = 30;
const MAX_SAMPLES = 5;
const MAX_SAMPLE_LENGTH = 40;
const ID_LIKE_SUFFIX = /(^|[_\s.])(id|uuid|key)$/i;
const ID_LIKE_CAMEL_SUFFIX = /[a-z](Id|Uuid|Key)$/;
const COMPOSER_VIZ_KINDS: ComposerVizKind[] = [
    'table',
    'bar',
    'line',
    'pie',
    'big_number',
];

export type PlanComposerViz = (args: {
    title: string | null;
    description: string | null;
    terminalNode: { title: string | null; description: string | null };
    columns: ResultColumns;
    rows: Record<string, AnyType>[];
    rowCount: number;
    enableDataAccess: boolean;
    previousVizConfig: AllVizChartConfig | null;
}) => Promise<AllVizChartConfig | null>;

/** Code-gated candidates the planner may pick from; Jev only chooses among them. */
export type VizPlannerShape = {
    columns: ResultColumn[];
    /** Kinds the result can render as; any other pick is unsupported. */
    supportedKinds: ComposerVizKind[];
    xCandidates: string[];
    yCandidates: string[];
    pieCandidates: string[];
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

/** Result shape for the planner: code-gated candidates plus the state Jev sees. */
const getVizPlannerShape = ({
    columns: resultColumns,
    rows,
    rowCount,
    enableDataAccess,
}: {
    columns: ResultColumns;
    rows: Record<string, AnyType>[];
    rowCount: number;
    enableDataAccess: boolean;
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

    const supportedKinds: ComposerVizKind[] = ['table'];
    if (rowCount > 0 && hasCartesian) supportedKinds.push('bar', 'line');
    if (rowCount > 0 && pieCandidates.length > 0 && yCandidates.length > 0)
        supportedKinds.push('pie');
    if (rowCount === 1 && yCandidates.length > 0)
        supportedKinds.push('big_number');

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
            xCandidates,
            yCandidates,
            pieCandidates,
        },
        state,
    };
};

const previousAxes = (previous: AllVizChartConfig | null) => {
    if (!previous || isVizTableConfig(previous)) return { x: null, y: null };
    return {
        x: previous.fieldConfig?.x?.reference ?? null,
        y: previous.fieldConfig?.y[0]?.reference ?? null,
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

const KIND_DESCRIPTIONS: Record<ComposerVizKind, string> = {
    table: 'A table of the rows: detailed records, many fields, or no chart that answers the question.',
    bar: 'Bars comparing one measure across categories.',
    line: 'A line of one measure over an ordered axis, usually time.',
    pie: 'A part-to-whole breakdown across a few nonnegative categories.',
    big_number: 'A single headline value.',
};

const getQuestions = (
    shape: VizPlannerShape,
    previous: { x: string | null; y: string | null },
): Record<string, DecisionQuestion> => {
    const labelOf = (reference: string) =>
        shape.columns.find((column) => column.reference === reference)?.label ??
        null;
    const questions: Record<string, DecisionQuestion> = {
        kind: {
            type: 'choice',
            instructions:
                'Choose how the final result should be visualized to answer the question, given its columns and shape. Respect explicit visualization requests and agent instructions, even for a kind outside supportedKinds. Do not hide requested fields to make a chart fit. Choose none if uncertain.',
            criteria: {
                ...Object.fromEntries(
                    COMPOSER_VIZ_KINDS.map((kind) => [
                        kind,
                        KIND_DESCRIPTIONS[kind],
                    ]),
                ),
                [NONE]: 'Unsure',
            },
        },
        explicitStyle: {
            type: 'noul',
            instructions:
                'Did the user question or agent instructions explicitly request a visualization kind such as a table, bar, line, pie or single number?',
        },
    };
    if (shape.xCandidates.length > 0) {
        questions.x = {
            type: 'choice',
            instructions:
                'Choose the column for the x-axis or pie categories. Prefer the time column for a trend and the grouping the question asks about. Never choose an identifier unless the question is about individual records. Choose none if no column fits.',
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
            instructions:
                'Choose the measure the question asks about for the value axis. Never choose an identifier or a year used as a label.',
            criteria: yCriteria,
        };
    }
    return questions;
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

/** Applies the planner policy to Jev's answers; null when any pick is unsure or unsupported. */
export const getVizConfigFromAnswers = ({
    answers,
    shape,
    columns,
    previousVizConfig,
}: {
    answers: DecisionAnswers;
    shape: VizPlannerShape;
    columns: ResultColumns;
    previousVizConfig: AllVizChartConfig | null;
}): AllVizChartConfig | null => {
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
            fieldConfig: getComposerFieldConfig({ x: null, y }),
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
    return buildComposerVizConfig({
        kind,
        fieldConfig: getComposerFieldConfig({ x, y }),
    });
};

const KIND_NAMES: Record<ComposerVizKind, string> = {
    table: 'table',
    bar: 'bar chart',
    line: 'line chart',
    pie: 'pie chart',
    big_number: 'big number',
};

const axesNote = (x: string | undefined, y: string | undefined) =>
    [...(x ? [`x = ${x}`] : []), ...(y ? [`y = ${y}`] : [])].join(', ');

/** The composer tool result line for the column-type default, when nothing was planned. */
export const getDefaultVizNote = ({ defaultKind, axes }: ComposerVizPlan) => {
    if (defaultKind === 'table') return 'Visualization: default table.';
    const defaultAxes = axes[defaultKind];
    const parts = axesNote(defaultAxes?.x?.reference, defaultAxes?.y.reference);
    return `Visualization: default ${KIND_NAMES[defaultKind]}${parts ? `, ${parts}` : ''}.`;
};

/** The composer tool result line telling the agent what the artifact opens on. */
export const getVizConfigNote = (vizConfig: AllVizChartConfig) => {
    if (isVizTableConfig(vizConfig)) return 'Visualization: table.';
    const x = vizConfig.fieldConfig?.x?.reference;
    const y = vizConfig.fieldConfig?.y[0]?.reference;
    const axes = axesNote(x, y);
    return `Visualization: ${KIND_NAMES[getComposerVizKind(vizConfig)]}${axes ? `, ${axes}` : ''}.`;
};

export const createVizPlanner =
    ({
        decisions,
        question,
        conversation,
        usage,
        recordDecision,
    }: {
        decisions: Pick<AiDecisionClient, 'evaluate'>;
        question: string;
        /** Carries the agent instructions. */
        conversation?: AgentDecisionContext;
        usage?: Pick<AiDecisionUsage, 'serviceMs'>;
        recordDecision?: RecordPromptDecisionFn;
    }): PlanComposerViz =>
    async ({
        title,
        description,
        terminalNode,
        columns,
        rows,
        rowCount,
        enableDataAccess,
        previousVizConfig,
    }) => {
        const startedAt = performance.now();
        const serviceMsBefore = usage?.serviceMs ?? null;
        let answers: DecisionAnswers | null = null;
        let vizConfig: AllVizChartConfig | null = null;
        let outcome: DbAiPromptComposerVizDecision['outcome'] = 'unavailable';
        try {
            const { shape, state } = getVizPlannerShape({
                columns,
                rows,
                rowCount,
                enableDataAccess,
            });
            if (shape.supportedKinds.length === 1) {
                // Only the table fits: nothing for Jev to decide.
                vizConfig = tableConfig(Object.values(columns));
                outcome = 'planned';
            } else if (question.trim()) {
                const previous = previousAxes(previousVizConfig);
                answers = await decisions.evaluate({
                    operation: VIZ_PLANNER_OPERATION,
                    state: {
                        question,
                        conversation,
                        artifact: { title, description },
                        terminalNode,
                        previousVizConfig: previousVizConfig
                            ? {
                                  kind: getComposerVizKind(previousVizConfig),
                                  ...previous,
                              }
                            : null,
                        supportedKinds: shape.supportedKinds,
                        rowCount,
                        columns: state,
                    },
                    questions: getQuestions(shape, previous),
                });
                vizConfig = answers
                    ? getVizConfigFromAnswers({
                          answers,
                          shape,
                          columns,
                          previousVizConfig,
                      })
                    : null;
                if (answers) outcome = vizConfig ? 'planned' : 'unresolved';
            }
        } catch (error) {
            Logger.warn(`Composer viz planner failed: ${String(error)}`);
            vizConfig = null;
            outcome = 'unavailable';
        }
        const serviceMsAfter = usage?.serviceMs ?? null;
        await recordDecision?.({
            operation: VIZ_PLANNER_OPERATION,
            outcome,
            intent: vizConfig ? { vizConfig } : null,
            applied: vizConfig !== null,
            answers,
            thresholds: VIZ_PLANNER_THRESHOLDS,
            latency_ms: Math.round(performance.now() - startedAt),
            jev_service_ms:
                serviceMsAfter === null
                    ? null
                    : Math.round(serviceMsAfter - (serviceMsBefore ?? 0)),
        });
        return vizConfig;
    };
