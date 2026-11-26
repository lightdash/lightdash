import { FilterOperator } from '@lightdash/common';
import { caution, positive } from './analyticsChartPresentation';
import { card, ranking, seriesByDay } from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const explore = 'agent_evaluation_runs';
const day = 'agent_evaluation_runs_event_ts_day';
const timezone = 'UTC';
const passRateDescription =
    'Passing assessments divided by all assessments, grouped by the day the run started. Runs without assessments do not count towards the rate.';

// Charts of the Agent evaluations dashboard. The list of recent runs stays with the plain charts in
// usageDashboardCharts.ts.
export const agentEvaluationsChartSpecs: UsageChartSpec[] = [
    card({
        key: 'evals-runs',
        name: 'Evaluation runs',
        description: 'Evaluation runs started in the selected period.',
        explore,
        day,
        metric: 'agent_evaluation_runs_total_runs',
        timezone,
    }),
    card({
        key: 'evals-passed-assessments',
        name: 'Passed assessments',
        description:
            'Assessments that passed in the selected period. Human and AI assessments count separately.',
        explore,
        day,
        metric: 'agent_evaluation_runs_passed_assessments',
        timezone,
    }),
    card({
        key: 'evals-failed-assessments',
        name: 'Failed assessments',
        description:
            'Assessments that failed in the selected period. An execution error is not a failed assessment.',
        explore,
        day,
        metric: 'agent_evaluation_runs_failed_assessments',
        timezone,
    }),
    {
        key: 'assessment-pass-rate-by-day',
        name: 'Assessment pass rate by day',
        description: passRateDescription,
        explore,
        dimensions: [day],
        metrics: ['agent_evaluation_runs_pass_rate'],
        visualization: 'line',
        timezone,
        limit: 365,
        sorts: [{ fieldId: day, descending: false }],
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.6',
            fieldMapping: {
                x: day,
                m1: 'agent_evaluation_runs_total_runs',
                m2: 'agent_evaluation_runs_pass_rate',
            },
            optionValues: {
                seriesType: 'bar',
                m2Type: 'line',
                dualAxis: true,
                m2Right: true,
                showSymbols: true,
                xAxisType: 'time',
                xTimeFormat: '{MMM} {d}',
                xName: 'Day',
                yName: 'Runs',
                yRightName: 'Pass rate',
                m1Name: 'Runs',
                m2Name: 'Pass rate',
                // A few runs a day: 1, 2, 3, not 0.5, 1.5, 2.5
                yIntegerTicks: true,
            },
            query: {
                dimensions: [day],
                metrics: [
                    'agent_evaluation_runs_total_runs',
                    'agent_evaluation_runs_pass_rate',
                ],
                sorts: [{ fieldId: day, descending: false }],
                limit: 365,
                description:
                    "Passing assessments divided by all assessments, by the day the run started, with the runs behind each day's rate. A rate from a few runs is not reliable.",
            },
        },
    },
    seriesByDay({
        key: 'assessment-volume-by-day',
        name: 'Passed and failed assessments by day',
        description:
            'Assessment count behind each day’s pass rate. Human and AI assessments count separately, matching the run summary.',
        explore,
        day,
        series: [
            {
                metric: 'agent_evaluation_runs_passed_assessments',
                name: 'Passed',
                color: positive,
            },
            {
                metric: 'agent_evaluation_runs_failed_assessments',
                name: 'Failed',
                color: caution,
            },
        ],
        yName: 'Assessments',
        stacked: true,
        wholeNumbers: true,
        timezone,
    }),
    ranking({
        key: 'quality-by-evaluation',
        name: 'Runs and assessment outcomes by agent and evaluation',
        description:
            'Recorded runs and assessment outcomes for each agent and evaluation.',
        explore,
        by: 'agent_evaluation_runs_agent_name',
        then: 'agent_evaluation_runs_evaluation_name',
        dimensions: [
            'agent_evaluation_runs_agent_name',
            'agent_evaluation_runs_agent_id',
            'agent_evaluation_runs_evaluation_name',
            'agent_evaluation_runs_evaluation_id',
        ],
        metrics: [
            'agent_evaluation_runs_total_runs',
            'agent_evaluation_runs_passed_assessments',
            'agent_evaluation_runs_failed_assessments',
            'agent_evaluation_runs_unassessed_results',
            'agent_evaluation_runs_execution_errors',
        ],
        extraMetrics: ['agent_evaluation_runs_pass_rate'],
        limit: 100,
        libraryDescription:
            'Recorded runs and assessment outcomes for each agent. Open an agent to see its evaluations.',
    }),
];

// Evaluations are a tab of the Agents dashboard: test runs of the agents, beside how their live
// requests end. The Agent and Evaluation filters reach only these tiles.
export const agentEvaluationFilters: NonNullable<
    UsageDashboardSpec['filters']
> = {
    dimensions: [
        { label: 'Agent', fieldId: 'agent_evaluation_runs_agent_name' },
        {
            label: 'Evaluation',
            fieldId: 'agent_evaluation_runs_evaluation_name',
        },
    ].map(({ label, fieldId }) => ({
        label,
        target: { fieldId, tableName: 'agent_evaluation_runs' },
        operator: FilterOperator.EQUALS,
        values: [],
        disabled: true,
    })),
    metrics: [],
    tableCalculations: [],
};

export const agentEvaluationSections: UsageDashboardSpec['tabs'][number]['sections'] =
    [
        {
            title: 'Do the agents pass their evaluations?',
            description:
                'Test runs of agents in the selected period, empty until one has run. Pass rate is passing assessments out of all assessments.',
            charts: [
                'evals-runs',
                'evals-passed-assessments',
                'evals-failed-assessments',
            ],
        },
        {
            title: 'Assessments by day',
            description: '',
            note: false,
            charts: ['assessment-pass-rate-by-day', 'assessment-volume-by-day'],
            layout: 'row',
            rowHeight: 8,
        },
        {
            title: 'Results by evaluation and run',
            description:
                'Compare evaluations and inspect single runs. Results come from the latest nightly refresh and change if history is removed.',
            charts: ['quality-by-evaluation'],
            layout: 'row',
            // A handful of evaluations is usual: room for six rows, more by scrolling
            rowHeight: 5,
        },
        {
            title: 'Recent runs',
            description: '',
            note: false,
            charts: ['recent-evaluation-runs'],
            layout: 'row',
            rowHeight: 7,
        },
    ];
