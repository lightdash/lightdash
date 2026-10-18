import {
    ChartType,
    COMPOSER_TABLE_INTENT,
    COMPOSER_TABLE_VIZ,
    DimensionType,
    getResultColumnFieldId,
    type AiChartIntent,
    type AiComposerChartViz,
    type AnyType,
    type QueryNodeId,
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
    groupBy: 0.85,
    explicitStyle: 0.85,
} as const;

const KEEP = 'keep';
const NONE = 'none';
const MAX_COLUMNS = 30;
const MAX_SAMPLES = 5;
const MAX_SAMPLE_LENGTH = 40;
const MAX_SERIES = 12;
const ID_LIKE_SUFFIX = /(^|[_\s.])(id|uuid|key)$/i;
const ID_LIKE_CAMEL_SUFFIX = /[a-z](Id|Uuid|Key)$/;

/** The kinds the planner chooses among; the agent vocabulary plus the big number it lacks. */
export type ComposerVizKind = 'table' | 'bar' | 'line' | 'pie' | 'big_number';

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
    terminalNodeId: QueryNodeId;
    columns: ResultColumns;
    rows: Record<string, AnyType>[];
    rowCount: number;
    enableDataAccess: boolean;
    previousViz: AiComposerChartViz | null;
}) => Promise<AiComposerChartViz | null>;

/** Code-gated candidates the planner may pick from; Jev only chooses among them. */
export type VizPlannerShape = {
    columns: ResultColumn[];
    /** Kinds the result can render as; any other pick is unsupported. */
    supportedKinds: ComposerVizKind[];
    xCandidates: string[];
    yCandidates: string[];
    pieCandidates: string[];
    /** Low-cardinality columns that can split bar/line into series. */
    groupByCandidates: string[];
};

const isNumeric = (column: ResultColumn) =>
    column.type === DimensionType.NUMBER;

const isTemporal = (column: ResultColumn) =>
    column.type === DimensionType.DATE ||
    column.type === DimensionType.TIMESTAMP;

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
    // Low cardinality needs row stats, so without data access nothing splits series.
    const groupByCandidates = nonNumerics
        .filter((column) => {
            if (!enableDataAccess) return false;
            const distinctCount = stats.get(column.reference)?.distinctCount;
            return distinctCount !== undefined && distinctCount <= MAX_SERIES;
        })
        .map((column) => column.reference)
        .filter((groupBy) => xCandidates.some((x) => x !== groupBy));

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
            groupByCandidates,
        },
        state,
    };
};

type PreviousAxes = {
    kind: ComposerVizKind | null;
    x: string | null;
    y: string | null;
    groupBy: string | null;
};

/** The kind a viz opens on, in the planner's vocabulary; null for kinds the planner never picks. */
export const getComposerVizKind = (
    viz: AiComposerChartViz,
): ComposerVizKind | null => {
    if (viz.chartConfig) {
        switch (viz.chartConfig.type) {
            case ChartType.BIG_NUMBER:
                return 'big_number';
            case ChartType.TABLE:
                return 'table';
            case ChartType.PIE:
                return 'pie';
            case ChartType.CARTESIAN:
                return null;
            default:
                return null;
        }
    }
    switch (viz.intent?.defaultVizType) {
        case 'bar':
        case 'horizontal':
            return 'bar';
        case 'line':
        case 'scatter':
            return 'line';
        case 'pie':
            return 'pie';
        case 'table':
        case undefined:
            return 'table';
        default:
            return null;
    }
};

// Intent fields are field ids (`<node>_<column>`); the planner thinks in columns.
const columnOf = (fieldId: string | null | undefined, terminalNodeId: string) =>
    fieldId && fieldId.startsWith(`${terminalNodeId}_`)
        ? fieldId.slice(terminalNodeId.length + 1)
        : (fieldId ?? null);

const previousAxes = (
    previous: AiComposerChartViz | null,
    terminalNodeId: string,
): PreviousAxes => {
    if (!previous) return { kind: null, x: null, y: null, groupBy: null };
    return {
        kind: getComposerVizKind(previous),
        x: columnOf(previous.intent?.xAxisDimension, terminalNodeId),
        y: columnOf(previous.intent?.yAxisMetrics?.[0], terminalNodeId),
        groupBy: columnOf(previous.intent?.groupBy?.[0], terminalNodeId),
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
    bar: 'Bars comparing one measure across categories, optionally split into series by another category.',
    line: 'A line of one measure over an ordered axis, usually time, optionally one line per category.',
    pie: 'A part-to-whole breakdown across a few nonnegative categories.',
    big_number: 'A single headline value.',
};

const getQuestions = (
    shape: VizPlannerShape,
    previous: PreviousAxes,
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
    if (shape.groupByCandidates.length > 0) {
        questions.groupBy = {
            type: 'choice',
            instructions:
                'For a bar or line chart, choose the column that splits the measure into one series per value, such as region in revenue by month by region. It must differ from the x-axis column. Choose none when the question does not ask for a breakdown or the rows have one value per x.',
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

const getIntentAxisType = (
    kind: ComposerVizKind,
    x: ResultColumn | null,
): AiChartIntent['xAxisType'] => {
    if (kind === 'pie' || !x) return null;
    return isTemporal(x) ? 'time' : 'category';
};

/** The viz for a kind and its axes, in the agent vocabulary (a big number is an explorer config, the vocabulary has none). */
export const buildComposerViz = ({
    kind,
    terminalNodeId,
    x,
    y,
    groupBy = null,
}: {
    kind: ComposerVizKind;
    terminalNodeId: QueryNodeId;
    x: ResultColumn | null;
    y: ResultColumn | null;
    groupBy?: ResultColumn | null;
}): AiComposerChartViz => {
    const fieldId = (column: ResultColumn) =>
        getResultColumnFieldId(terminalNodeId, column.reference);
    switch (kind) {
        case 'table':
            return COMPOSER_TABLE_VIZ;
        case 'big_number':
            return {
                intent: null,
                chartConfig: {
                    type: ChartType.BIG_NUMBER,
                    config: y ? { selectedField: fieldId(y) } : {},
                },
                pivotConfig: null,
            };
        case 'bar':
        case 'line':
        case 'pie': {
            const intent: AiChartIntent = {
                ...COMPOSER_TABLE_INTENT,
                defaultVizType: kind,
                xAxisDimension: x ? fieldId(x) : null,
                yAxisMetrics: y ? [fieldId(y)] : null,
                groupBy: groupBy && kind !== 'pie' ? [fieldId(groupBy)] : null,
                xAxisType: getIntentAxisType(kind, x),
            };
            return { intent, chartConfig: null, pivotConfig: null };
        }
        default:
            return COMPOSER_TABLE_VIZ;
    }
};

/** Applies the planner policy to Jev's answers; null when any pick is unsure or unsupported. */
export const getVizFromAnswers = ({
    answers,
    shape,
    columns,
    terminalNodeId,
    previousViz,
}: {
    answers: DecisionAnswers;
    shape: VizPlannerShape;
    columns: ResultColumns;
    terminalNodeId: QueryNodeId;
    previousViz: AiComposerChartViz | null;
}): AiComposerChartViz | null => {
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
    if (kind === 'table') return COMPOSER_TABLE_VIZ;

    const previous = previousAxes(previousViz, terminalNodeId);
    const yReference = resolveColumn(
        answers.y,
        shape.yCandidates,
        previous.y,
        VIZ_PLANNER_THRESHOLDS.y,
    );
    const y = yReference === null ? undefined : columns[yReference];
    if (!y) return null;
    if (kind === 'big_number') {
        return buildComposerViz({ kind, terminalNodeId, x: null, y });
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
    return buildComposerViz({ kind, terminalNodeId, x, y, groupBy });
};

const KIND_NAMES: Record<ComposerVizKind, string> = {
    table: 'table',
    bar: 'bar chart',
    line: 'line chart',
    pie: 'pie chart',
    big_number: 'big number',
};

/** The composer tool result line telling the agent what the artifact opens on. */
export const getVizNote = (
    viz: AiComposerChartViz,
    terminalNodeId: QueryNodeId,
) => {
    const kind = getComposerVizKind(viz);
    if (kind === 'table') return 'Visualization: table.';
    const name = kind
        ? KIND_NAMES[kind]
        : `${viz.chartConfig?.type ?? 'custom'} chart`;
    const x = columnOf(viz.intent?.xAxisDimension, terminalNodeId);
    const y = columnOf(viz.intent?.yAxisMetrics?.[0], terminalNodeId);
    const groupBy = columnOf(viz.intent?.groupBy?.[0], terminalNodeId);
    const parts = [
        ...(x ? [`x = ${x}`] : []),
        ...(y ? [`y = ${y}`] : []),
        ...(groupBy ? [`split by ${groupBy}`] : []),
    ].join(', ');
    return `Visualization: ${name}${parts ? `, ${parts}` : ''}.`;
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
        terminalNodeId,
        columns,
        rows,
        rowCount,
        enableDataAccess,
        previousViz,
    }) => {
        const startedAt = performance.now();
        const serviceMsBefore = usage?.serviceMs ?? null;
        let answers: DecisionAnswers | null = null;
        let viz: AiComposerChartViz | null = null;
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
                viz = COMPOSER_TABLE_VIZ;
                outcome = 'planned';
            } else if (question.trim()) {
                const previous = previousAxes(previousViz, terminalNodeId);
                answers = await decisions.evaluate({
                    operation: VIZ_PLANNER_OPERATION,
                    state: {
                        question,
                        conversation,
                        artifact: { title, description },
                        terminalNode,
                        previousVizConfig: previousViz ? previous : null,
                        supportedKinds: shape.supportedKinds,
                        rowCount,
                        columns: state,
                    },
                    questions: getQuestions(shape, previous),
                });
                viz = answers
                    ? getVizFromAnswers({
                          answers,
                          shape,
                          columns,
                          terminalNodeId,
                          previousViz,
                      })
                    : null;
                if (answers) outcome = viz ? 'planned' : 'unresolved';
            }
        } catch (error) {
            Logger.warn(`Composer viz planner failed: ${String(error)}`);
            viz = null;
            outcome = 'unavailable';
        }
        const serviceMsAfter = usage?.serviceMs ?? null;
        await recordDecision?.({
            operation: VIZ_PLANNER_OPERATION,
            outcome,
            intent: viz ? { viz } : null,
            applied: viz !== null,
            answers,
            thresholds: VIZ_PLANNER_THRESHOLDS,
            latency_ms: Math.round(performance.now() - startedAt),
            jev_service_ms:
                serviceMsAfter === null
                    ? null
                    : Math.round(serviceMsAfter - (serviceMsBefore ?? 0)),
        });
        return viz;
    };
