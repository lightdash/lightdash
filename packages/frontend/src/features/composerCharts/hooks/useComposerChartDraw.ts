import {
    getComposerChartDisplayedQueryUuid,
    getComposerChartDraw,
    pickComposerChartRows,
    withZoomedColumnLabels,
    type ComposerChart,
    type ComposerChartDraw,
    type ComposerChartRunResults,
    type ResultRow,
} from '@lightdash/common';
import * as Sentry from '@sentry/react';
import { useEffect, useMemo } from 'react';
import {
    useInfiniteQueryResults,
    type InfiniteQueryResults,
} from '../../../hooks/useQueryResults';

export const COMPOSER_CHART_SENTRY_TAGS = { 'lightdash.chartKind': 'composer' };

type DrawState =
    | { status: 'loading' }
    | { status: 'ready'; draw: ComposerChartDraw }
    | { status: 'error'; message: string };

type ComposerChartDrawResult = {
    /** Null while loading or when the run no longer fits the chart. */
    draw: ComposerChartDraw | null;
    /** The displayed query's results; draw the full chart only once `hasFetchedAllRows`. */
    results: InfiniteQueryResults;
    /** Rows keyed by the chart's field ids. */
    rows: ResultRow[];
    /** The series-split stage when the chart has one, else the terminal query. */
    displayedQueryUuid: string | null;
    /** A results or draw failure; the chart and run requests report their own. */
    error: string | null;
};

/** Turns a stored composer chart and one of its runs into what the visualization draws. */
export const useComposerChartDraw = ({
    projectUuid,
    chart,
    run,
    title,
}: {
    projectUuid: string | undefined;
    chart: Pick<ComposerChart, 'pipeline' | 'chart'> | null;
    run: ComposerChartRunResults | null;
    title: string;
}): ComposerChartDrawResult => {
    const terminalQueryUuid = run?.queries.find(
        ({ nodeId }) => nodeId === chart?.pipeline.terminalNodeId,
    )?.queryUuid;
    const displayedQueryUuid =
        run && chart
            ? getComposerChartDisplayedQueryUuid(
                  run,
                  chart.pipeline.terminalNodeId,
              )
            : null;
    const drawsFromStage =
        !!displayedQueryUuid && displayedQueryUuid !== terminalQueryUuid;
    const terminal = useInfiniteQueryResults(
        projectUuid,
        terminalQueryUuid,
        title,
        null,
        { toastErrors: false },
    );
    const stage = useInfiniteQueryResults(
        projectUuid,
        drawsFromStage ? displayedQueryUuid : undefined,
        title,
        null,
        { toastErrors: false },
    );
    const results = drawsFromStage ? stage : terminal;
    useEffect(() => {
        if (
            results.queryUuid &&
            !results.hasFetchedAllRows &&
            !results.fetchAll
        )
            results.setFetchAll(true);
    }, [results]);

    const drawState = useMemo((): DrawState => {
        if (!chart || !run || !terminal.columns) return { status: 'loading' };
        try {
            return {
                status: 'ready',
                draw: getComposerChartDraw({
                    pipeline: chart.pipeline,
                    chart: chart.chart,
                    columns: withZoomedColumnLabels(
                        Object.values(terminal.columns),
                        run.zoomedFieldLabels,
                    ),
                    fields: run.fields,
                }),
            };
        } catch (error) {
            Sentry.captureException(error, {
                tags: COMPOSER_CHART_SENTRY_TAGS,
            });
            return {
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }, [chart, run, terminal.columns]);
    const draw = drawState.status === 'ready' ? drawState.draw : null;

    const rows = useMemo(() => {
        if (!draw) return [];
        return drawsFromStage
            ? results.rows
            : pickComposerChartRows(draw, results.rows);
    }, [draw, drawsFromStage, results.rows]);

    const error =
        terminal.error?.error.message ??
        stage.error?.error.message ??
        (drawState.status === 'error' ? drawState.message : null);

    return { draw, results, rows, displayedQueryUuid, error };
};
