import {
    deriveDataAppVizPivotConfig,
    deriveDataAppVizPivotConfiguration,
    ECHARTS_DEFAULT_COLORS,
    getEffectiveOptionValues,
    getItemMap,
    isSummaryExploreError,
    QueryExecutionContext,
    type DataAppVizContext,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
    type ItemsMap,
    type OrganizationColorPaletteWithIsActive,
} from '@lightdash/common';
import { useComputedColorScheme } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { type QueryResultsProps } from '../../../hooks/useQueryResults';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';
import {
    buildTestMetricQuery,
    isMappingComplete,
} from '../components/dataAppVizTestQuery';
import { getDataAppVizFieldItems } from '../utils/getDataAppVizFieldItems';

type Run = { args: QueryResultsProps; mapping: Record<string, string> };

type Args = {
    projectUuid: string;
    schema: DataAppVizSchema;
    onContextChange: (ctx: DataAppVizContext | null) => void;
};

export type DataAppVizTestContextState = {
    exploreName: string | null;
    exploreOptions: { value: string; label: string }[];
    handleExploreChange: (value: string | null) => void;
    fieldMapping: Record<string, string>;
    setField: (name: string, id: string | null) => void;
    itemsMap: ItemsMap;
    dimensions: ReturnType<typeof getDataAppVizFieldItems>['dimensions'];
    metrics: ReturnType<typeof getDataAppVizFieldItems>['metrics'];
    effectiveOptions: DataAppVizOptionValues;
    setOption: (name: string, value: DataAppVizOptionValue) => void;
    colorPaletteUuid: string | null;
    setColorPaletteUuid: (uuid: string | null) => void;
    palettes: OrganizationColorPaletteWithIsActive[];
    handleRun: () => void;
    /** Every required declared field is mapped and an explore is picked. */
    complete: boolean;
    isRunning: boolean;
    error: unknown;
};

/**
 * Stateful core of testing a data app viz with real data outside a chart:
 * pick an explore, map the declared fields, run one sample query, and push
 * the resulting `DataAppVizContext` up via `onContextChange`.
 */
export const useDataAppVizTestContext = ({
    projectUuid,
    schema,
    onContextChange,
}: Args): DataAppVizTestContextState => {
    const [exploreName, setExploreName] = useState<string | null>(null);
    const [fieldMapping, setFieldMapping] = useState<Record<string, string>>(
        {},
    );
    // Only what the user explicitly changed; defaults resolve at push time.
    const [optionValues, setOptionValues] = useState<DataAppVizOptionValues>(
        {},
    );
    // Preview-only; a chart using the viz owns the palette the normal way.
    const [colorPaletteUuid, setColorPaletteUuid] = useState<string | null>(
        null,
    );
    // Snapshot captured on Run, so nothing fires while fields are still being picked.
    const [run, setRun] = useState<Run | null>(null);

    const explores = useExplores(projectUuid, true);
    const explore = useExploreByProjectUuid(
        exploreName ?? undefined,
        projectUuid,
    );

    const itemsMap = useMemo(
        () => (explore.data ? getItemMap(explore.data) : {}),
        [explore.data],
    );
    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap),
        [itemsMap],
    );

    const [{ query, queryResults }] = useQueryExecutor(
        run?.args ?? null,
        [],
        Boolean(run),
    );

    const effectiveOptions = useMemo(
        () => getEffectiveOptionValues(schema.configOptions, optionValues),
        [schema.configOptions, optionValues],
    );

    const colorScheme = useComputedColorScheme();
    const { data: palettes = [] } = useColorPalettes();
    const { data: projectPalette } = useProjectColorPalette(projectUuid);
    const selectedPalette = useMemo(
        () => palettes.find((p) => p.colorPaletteUuid === colorPaletteUuid),
        [palettes, colorPaletteUuid],
    );
    const colorPalette = useMemo(() => {
        const source = selectedPalette ?? projectPalette;
        if (!source) return ECHARTS_DEFAULT_COLORS;
        if (colorScheme === 'dark' && source.darkColors) {
            return source.darkColors;
        }
        return source.colors;
    }, [selectedPalette, projectPalette, colorScheme]);

    const rows = queryResults.rows;
    // Only push rows belonging to this run's query — on a re-run the executor
    // transiently re-exposes the previous query's cached page before the new
    // queryUuid lands.
    const runQueryUuid = query.data?.queryUuid;
    useEffect(() => {
        if (
            run &&
            rows.length > 0 &&
            runQueryUuid &&
            queryResults.queryUuid === runQueryUuid
        ) {
            onContextChange({
                fieldMapping: run.mapping,
                rows,
                options: effectiveOptions,
                colorPalette,
                pivotDetails: queryResults.pivotDetails ?? null,
                underlyingData: { enabled: false },
            });
        }
    }, [
        rows,
        run,
        runQueryUuid,
        queryResults.queryUuid,
        queryResults.pivotDetails,
        effectiveOptions,
        colorPalette,
        onContextChange,
    ]);
    // Clear the preview when the consumer unmounts.
    useEffect(() => () => onContextChange(null), [onContextChange]);

    const clearRun = useCallback(() => {
        setRun(null);
        onContextChange(null);
    }, [onContextChange]);

    const handleExploreChange = useCallback(
        (value: string | null) => {
            setExploreName(value);
            setFieldMapping({});
            clearRun();
        },
        [clearRun],
    );

    const setField = useCallback(
        (name: string, id: string | null) => {
            setFieldMapping((prev) => {
                const next = { ...prev };
                if (id) next[name] = id;
                else delete next[name];
                return next;
            });
            clearRun();
        },
        [clearRun],
    );

    const setOption = useCallback(
        (name: string, value: DataAppVizOptionValue) => {
            setOptionValues((prev) => ({ ...prev, [name]: value }));
        },
        [],
    );

    const handleRun = useCallback(() => {
        if (!exploreName || !isMappingComplete(schema, fieldMapping)) return;
        const metricQuery = buildTestMetricQuery(
            exploreName,
            schema,
            fieldMapping,
        );
        const pivotConfig = deriveDataAppVizPivotConfig(
            schema.fields,
            fieldMapping,
        );
        setRun({
            args: {
                projectUuid,
                tableId: exploreName,
                query: metricQuery,
                context: QueryExecutionContext.DATA_APP_SAMPLE,
                pivotConfiguration: deriveDataAppVizPivotConfiguration(
                    fieldMapping,
                    pivotConfig,
                    metricQuery,
                    itemsMap,
                ),
            },
            mapping: fieldMapping,
        });
    }, [exploreName, schema, fieldMapping, projectUuid, itemsMap]);

    const exploreOptions = useMemo(
        () =>
            (explores.data ?? [])
                .filter((e) => !isSummaryExploreError(e))
                .map((e) => ({ value: e.name, label: e.label })),
        [explores.data],
    );

    const complete =
        Boolean(exploreName) && isMappingComplete(schema, fieldMapping);
    const isRunning =
        Boolean(run) && (query.isFetching || queryResults.isFetchingFirstPage);
    const error = query.error ?? queryResults.error;

    return {
        exploreName,
        exploreOptions,
        handleExploreChange,
        fieldMapping,
        setField,
        itemsMap,
        dimensions,
        metrics,
        effectiveOptions,
        setOption,
        colorPaletteUuid,
        setColorPaletteUuid,
        palettes,
        handleRun,
        complete,
        isRunning,
        error,
    };
};
