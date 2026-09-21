import {
    getDataAppVizFieldIds,
    getErrorMessage,
    getItemMap,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type DataAppVizSchema,
    type ItemsMap,
    type MetricQuery,
    type SavedChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import {
    autoMapDataAppVizFieldsFromPools,
    dataAppVizFieldPools,
    dataAppVizFieldPoolsFromMetricQuery,
    fillUnboundDataAppVizFields,
    type DataAppVizFieldPools,
} from '../utils/autoMapDataAppVizFields';
import { checkChartTypeFit } from '../utils/chartTypePreviewFit';
import {
    deriveChartTypePreviewMetricQuery,
    emptyChartTypePreviewMetricQuery,
    executeChartTypePreviewQuery,
} from '../utils/chartTypePreviewQuery';
import { bindableTableCalculations } from '../utils/chartTypePreviewTableCalcs';
import {
    type PreviewDataSelection,
    type PreviewDataSource,
    type PreviewFitState,
    type PreviewRunState,
} from './previewDataTypes';

export type ChartTypePreviewDataState = {
    selection: PreviewDataSelection;
    /** The binding actually rendered and queried, reconciled against the
     *  version on screen. */
    fieldMapping: DataAppVizFieldMapping;
    /** The query a run would execute; null while sample data is selected. */
    metricQuery: MetricQuery | null;
    exploreLabel: string | null;
    /** The chosen explore's columns, for the input selects. */
    itemsMap: ItemsMap;
    boundFieldCount: number;
    /** The version on screen declares inputs, so a query can be bound to it. */
    hasDeclaredInputs: boolean;
    run: PreviewRunState;
    fit: PreviewFitState;
    previewDataSource: PreviewDataSource;
    selectSample: () => void;
    selectSavedChart: (chart: SavedChart) => void;
    selectExplore: (exploreName: string) => void;
    /** Bind a suggested explore and mapping. `inferredFields` stand in for a
     *  declaration that does not exist yet, and are dropped the moment a build
     *  declares real inputs. */
    selectSuggestedData: (suggestion: {
        exploreName: string;
        fieldMapping: DataAppVizFieldMapping;
        inferredFields: DataAppVizField[] | null;
    }) => void;
    setField: (fieldName: string, fieldId: string | string[] | null) => void;
    runQuery: () => void;
};

const NO_FIELDS: DataAppVizFieldMapping = {};
const NO_ITEMS: ItemsMap = {};
const SAMPLE: PreviewDataSelection = { kind: 'sample' };
const NOT_RUN: PreviewRunState = { status: 'notRun' };

/**
 * The author's opt-in preview on real data.
 *
 * Nothing here reaches the warehouse on its own: selecting a chart or an
 * explore, binding an input and moving between versions all read metadata
 * only. `runQuery` is the single path that executes, once per call, and the
 * rows it returns live in this state for the session.
 */
export const useChartTypePreviewData = ({
    projectUuid,
    schema,
}: {
    projectUuid: string | undefined;
    schema: DataAppVizSchema | null;
}): ChartTypePreviewDataState => {
    const [selection, setSelection] = useState<PreviewDataSelection>(SAMPLE);
    const [run, setRun] = useState<PreviewRunState>(NOT_RUN);
    const [inferredFields, setInferredFields] = useState<
        DataAppVizField[] | null
    >(null);
    // Only the latest run may write results back, and only one is ever in
    // flight — neither depends on how the button is rendered.
    const runToken = useRef(0);
    const isRunning = useRef(false);

    // Inputs suggested for a chart type that has not been built yet stand in
    // for a declaration, so the binding, the fit and the query are all the
    // same code. A real declaration always wins.
    const activeSchema = useMemo<DataAppVizSchema | null>(() => {
        if (schema) return schema;
        if (!inferredFields) return null;
        return {
            fields: inferredFields,
            configOptions: [],
            colorPalette: null,
        };
    }, [schema, inferredFields]);

    const explore = useExploreByProjectUuid(
        selection.kind === 'query' ? selection.exploreName : undefined,
        projectUuid,
    );

    const base = selection.kind === 'query' ? selection.metricQuery : null;
    const itemsMap = useMemo(
        () =>
            explore.data && base
                ? getItemMap(
                      explore.data,
                      base.additionalMetrics,
                      bindableTableCalculations(base),
                      base.customDimensions,
                  )
                : NO_ITEMS,
        [explore.data, base],
    );

    // Bindings are filled from the columns a run would actually return, so a
    // version switch re-uses this run's rows instead of widening the query.
    const bindablePools: DataAppVizFieldPools | null = useMemo(() => {
        if (!base) return null;
        return run.status === 'ready'
            ? dataAppVizFieldPools(run.itemsMap)
            : dataAppVizFieldPoolsFromMetricQuery(base);
    }, [base, run]);

    // A first build names its own inputs, which the inferred names the
    // suggestion bound will not match. Re-map the declaration onto the very
    // same columns rather than carrying names nothing declares.
    const hasSupersededInferredFields =
        schema !== null && inferredFields !== null;

    const fieldMapping = useMemo(() => {
        if (selection.kind !== 'query' || !activeSchema || !bindablePools) {
            return NO_FIELDS;
        }
        return hasSupersededInferredFields
            ? autoMapDataAppVizFieldsFromPools(
                  activeSchema.fields,
                  bindablePools,
              )
            : fillUnboundDataAppVizFields(
                  activeSchema.fields,
                  bindablePools,
                  selection.fieldMapping,
              );
    }, [selection, activeSchema, bindablePools, hasSupersededInferredFields]);

    // Nothing here runs a query: the re-map only writes the binding the render
    // above already shows, so the inferred names stop being carried around.
    useEffect(() => {
        if (!hasSupersededInferredFields) return;
        setInferredFields(null);
        setSelection((current) =>
            current.kind === 'query' ? { ...current, fieldMapping } : current,
        );
    }, [hasSupersededInferredFields, fieldMapping]);

    const metricQuery = useMemo(
        () =>
            base && activeSchema
                ? deriveChartTypePreviewMetricQuery({
                      base,
                      schema: activeSchema,
                      fieldMapping,
                      itemsMap,
                  })
                : null,
        [base, activeSchema, fieldMapping, itemsMap],
    );

    const exploreError = explore.error ?? null;
    const fit: PreviewFitState = useMemo(() => {
        if (
            selection.kind !== 'query' ||
            !activeSchema ||
            activeSchema.fields.length === 0
        )
            return { status: 'notApplicable' };
        if (exploreError) {
            return {
                status: 'unavailable',
                message:
                    exploreError.error.statusCode === 403
                        ? 'You do not have access to this explore.'
                        : (exploreError.error.message ??
                          'This explore could not be read.'),
            };
        }
        if (!explore.data) return { status: 'resolving' };
        const issues = checkChartTypeFit(
            activeSchema.fields,
            fieldMapping,
            dataAppVizFieldPools(itemsMap),
        );
        return issues.length === 0
            ? { status: 'fits' }
            : { status: 'doesNotFit', issues };
    }, [
        selection.kind,
        activeSchema,
        explore.data,
        exploreError,
        fieldMapping,
        itemsMap,
    ]);

    const exploreLabel =
        selection.kind === 'query'
            ? (explore.data?.label ?? selection.exploreName)
            : null;

    const selectSample = useCallback(() => {
        runToken.current += 1;
        setSelection(SAMPLE);
        setRun(NOT_RUN);
        setInferredFields(null);
    }, []);

    const selectSavedChart = useCallback(
        (chart: SavedChart) => {
            runToken.current += 1;
            setRun(NOT_RUN);
            setInferredFields(null);
            setSelection({
                kind: 'query',
                exploreName: chart.tableName,
                savedChart: { uuid: chart.uuid, name: chart.name },
                metricQuery: chart.metricQuery,
                fieldMapping: schema
                    ? autoMapDataAppVizFieldsFromPools(
                          schema.fields,
                          dataAppVizFieldPoolsFromMetricQuery(
                              chart.metricQuery,
                          ),
                      )
                    : {},
            });
        },
        [schema],
    );

    const selectExplore = useCallback((exploreName: string) => {
        runToken.current += 1;
        setRun(NOT_RUN);
        setInferredFields(null);
        setSelection({
            kind: 'query',
            exploreName,
            savedChart: null,
            metricQuery: emptyChartTypePreviewMetricQuery(exploreName),
            fieldMapping: {},
        });
    }, []);

    const selectSuggestedData = useCallback(
        ({
            exploreName,
            fieldMapping: suggested,
            inferredFields: inferred,
        }: {
            exploreName: string;
            fieldMapping: DataAppVizFieldMapping;
            inferredFields: DataAppVizField[] | null;
        }) => {
            runToken.current += 1;
            setRun(NOT_RUN);
            setInferredFields(inferred);
            // Staying inside the explore already selected keeps the query it
            // came with — a saved chart's filters and sorts are not re-bound.
            setSelection((current) =>
                current.kind === 'query' && current.exploreName === exploreName
                    ? { ...current, fieldMapping: suggested }
                    : {
                          kind: 'query',
                          exploreName,
                          savedChart: null,
                          metricQuery:
                              emptyChartTypePreviewMetricQuery(exploreName),
                          fieldMapping: suggested,
                      },
            );
        },
        [],
    );

    const setField = useCallback(
        (fieldName: string, fieldId: string | string[] | null) => {
            runToken.current += 1;
            // Rows from the previous binding are not this binding's results.
            setRun(NOT_RUN);
            setSelection((current) => {
                if (current.kind !== 'query') return current;
                // Start from the binding on screen, so inputs filled in for
                // the author survive an edit to a different input.
                const next = { ...fieldMapping };
                if (fieldId === null) delete next[fieldName];
                else next[fieldName] = fieldId;
                return { ...current, fieldMapping: next };
            });
        },
        [fieldMapping],
    );

    const runQuery = useCallback(() => {
        if (!projectUuid || !metricQuery || !activeSchema) return;
        if (isRunning.current) return;
        isRunning.current = true;
        runToken.current += 1;
        const token = runToken.current;
        setRun({ status: 'running' });
        void executeChartTypePreviewQuery({
            projectUuid,
            metricQuery,
            schema: activeSchema,
            fieldMapping,
            itemsMap,
        })
            .then((result) => {
                isRunning.current = false;
                // Polling cannot be cancelled, so an abandoned run is simply
                // not consumed; its rows never reach the preview.
                if (token !== runToken.current) return;
                // The binding these rows belong to is now the selection's.
                setSelection((current) =>
                    current.kind === 'query'
                        ? { ...current, fieldMapping }
                        : current,
                );
                setRun({
                    status: 'ready',
                    rows: result.rows,
                    itemsMap: result.itemsMap,
                    pivotDetails: result.pivotDetails,
                    rowCount: result.rows.length,
                    ranAt: new Date(),
                });
            })
            .catch((error: unknown) => {
                isRunning.current = false;
                if (token !== runToken.current) return;
                setRun({ status: 'error', message: getErrorMessage(error) });
            });
    }, [projectUuid, metricQuery, activeSchema, fieldMapping, itemsMap]);

    const boundFieldCount = useMemo(
        () =>
            new Set(Object.values(fieldMapping).flatMap(getDataAppVizFieldIds))
                .size,
        [fieldMapping],
    );

    const previewDataSource: PreviewDataSource = (() => {
        if (fit.status === 'unavailable') {
            return { kind: 'unavailable', message: fit.message };
        }
        if (fit.status === 'doesNotFit') {
            return { kind: 'mismatch', issueCount: fit.issues.length };
        }
        return run.status === 'ready' && exploreLabel !== null
            ? {
                  kind: 'live',
                  exploreLabel,
                  rowCount: run.rowCount,
                  ranAt: run.ranAt,
              }
            : { kind: 'sample' };
    })();

    return {
        selection,
        fieldMapping,
        metricQuery,
        exploreLabel,
        itemsMap,
        boundFieldCount,
        hasDeclaredInputs: (activeSchema?.fields.length ?? 0) > 0,
        run,
        fit,
        previewDataSource,
        selectSample,
        selectSavedChart,
        selectExplore,
        selectSuggestedData,
        setField,
        runQuery,
    };
};
