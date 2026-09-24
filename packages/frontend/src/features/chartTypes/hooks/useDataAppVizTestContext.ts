import {
    deriveDataAppVizFieldMetadata,
    deriveDataAppVizPivotConfig,
    deriveDataAppVizPivotConfiguration,
    ECHARTS_DEFAULT_COLORS,
    getEffectiveOptionValues,
    getEffectiveDataAppVizFieldOptionValues,
    getEffectiveDataAppVizFieldColorValues,
    pruneDataAppVizFieldOptionValues,
    pruneDataAppVizFieldColorValues,
    resolveDataAppVizFieldColors,
    getItemMap,
    isSummaryExploreError,
    QueryExecutionContext,
    type DataAppVizContext,
    type DataAppVizFieldMapping,
    type DataAppVizFieldOptionValues,
    type DataAppVizFieldColorValues,
    type DataAppVizColorGradient,
    type DataAppVizColorRule,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
    type ItemsMap,
    type OrganizationColorPaletteWithIsActive,
} from '@lightdash/common';
import { useComputedColorScheme } from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useDataAppVizResolvedColors } from './useDataAppVizResolvedColors';

type Run = {
    args: QueryResultsProps;
    fieldMapping: DataAppVizFieldMapping;
};

const EMPTY_FIELD_MAPPING = {};

type Args = {
    projectUuid: string;
    schema: DataAppVizSchema;
    onContextChange: (ctx: DataAppVizContext | null) => void;
};

export type DataAppVizTestContextState = {
    exploreName: string | null;
    exploreOptions: { value: string; label: string }[];
    handleExploreChange: (value: string | null) => void;
    fieldMapping: DataAppVizFieldMapping;
    setField: (name: string, id: string | string[] | null) => void;
    itemsMap: ItemsMap;
    dimensions: ReturnType<typeof getDataAppVizFieldItems>['dimensions'];
    metrics: ReturnType<typeof getDataAppVizFieldItems>['metrics'];
    effectiveOptions: DataAppVizOptionValues;
    effectiveFieldOptions: DataAppVizFieldOptionValues;
    effectiveFieldColors: DataAppVizFieldColorValues;
    setFieldOption: (
        slot: string,
        fieldId: string,
        name: string,
        value: DataAppVizOptionValue,
    ) => void;
    setFieldGradient: (
        slot: string,
        fieldId: string,
        declaredDefault: DataAppVizColorGradient,
        patch: Partial<DataAppVizColorGradient>,
    ) => void;
    setFieldRules: (
        slot: string,
        fieldId: string,
        declaredDefault: DataAppVizColorRule[],
        update: (rules: DataAppVizColorRule[]) => DataAppVizColorRule[],
    ) => void;
    setOption: (name: string, value: DataAppVizOptionValue) => void;
    colorPaletteUuid: string | null;
    setColorPaletteUuid: (uuid: string | null) => void;
    palettes: OrganizationColorPaletteWithIsActive[];
    /** The same selected light/dark palette delivered to the test iframe. */
    colorPalette: string[];
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
    const [fieldMapping, setFieldMapping] = useState<DataAppVizFieldMapping>(
        {},
    );
    const fieldMappingRef = useRef(fieldMapping);
    // Only what the user explicitly changed; defaults resolve at push time.
    const [optionValues, setOptionValues] = useState<DataAppVizOptionValues>(
        {},
    );
    const [fieldOptionValues, setFieldOptionValues] =
        useState<DataAppVizFieldOptionValues>({});
    const [fieldColorValues, setFieldColorValues] =
        useState<DataAppVizFieldColorValues>({});
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
    const effectiveFieldOptions = useMemo(
        () =>
            getEffectiveDataAppVizFieldOptionValues(
                schema.fields,
                fieldMapping,
                fieldOptionValues,
            ),
        [schema.fields, fieldMapping, fieldOptionValues],
    );
    const effectiveFieldColors = useMemo(
        () =>
            getEffectiveDataAppVizFieldColorValues(
                schema.fields,
                fieldMapping,
                fieldColorValues,
            ),
        [schema.fields, fieldMapping, fieldColorValues],
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
    const resolvedColors = useDataAppVizResolvedColors({
        itemsMap,
        rows,
        fieldMapping: run?.fieldMapping ?? EMPTY_FIELD_MAPPING,
        pivotDetails: queryResults.pivotDetails ?? null,
        colorPalette,
    });
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
                fieldMapping: run.fieldMapping,
                fields: deriveDataAppVizFieldMetadata(
                    run.fieldMapping,
                    itemsMap,
                ),
                rows,
                options: effectiveOptions,
                fieldOptions: getEffectiveDataAppVizFieldOptionValues(
                    schema.fields,
                    run.fieldMapping,
                    fieldOptionValues,
                ),
                fieldColors: resolveDataAppVizFieldColors({
                    fields: schema.fields,
                    fieldMapping: run.fieldMapping,
                    fieldColorValues,
                    rows,
                    pivotDetails: queryResults.pivotDetails ?? null,
                }),
                colorPalette,
                ...resolvedColors,
                pivotDetails: queryResults.pivotDetails ?? null,
                underlyingData: { enabled: false },
                drillDown: { enabled: false },
                pointMenu: { enabled: false },
            });
        }
    }, [
        rows,
        run,
        runQueryUuid,
        itemsMap,
        queryResults.queryUuid,
        queryResults.pivotDetails,
        effectiveOptions,
        fieldOptionValues,
        fieldColorValues,
        schema.fields,
        colorPalette,
        resolvedColors,
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
            fieldMappingRef.current = {};
            setFieldMapping({});
            setFieldOptionValues({});
            setFieldColorValues({});
            clearRun();
        },
        [clearRun],
    );

    const setField = useCallback(
        (name: string, id: string | string[] | null) => {
            const next = { ...fieldMappingRef.current };
            if (id !== null) next[name] = id;
            else delete next[name];
            fieldMappingRef.current = next;
            setFieldMapping(next);
            setFieldOptionValues((values) =>
                pruneDataAppVizFieldOptionValues(schema.fields, next, values),
            );
            setFieldColorValues((values) =>
                pruneDataAppVizFieldColorValues(schema.fields, next, values),
            );
            clearRun();
        },
        [clearRun, schema.fields],
    );

    const setFieldOption = useCallback(
        (
            slot: string,
            fieldId: string,
            name: string,
            value: DataAppVizOptionValue,
        ) => {
            setFieldOptionValues((prev) => {
                const binding = fieldMappingRef.current[slot];
                if (
                    binding !== fieldId &&
                    (!Array.isArray(binding) || !binding.includes(fieldId))
                )
                    return prev;
                return {
                    ...prev,
                    [slot]: {
                        ...prev[slot],
                        [fieldId]: { ...prev[slot]?.[fieldId], [name]: value },
                    },
                };
            });
        },
        [],
    );

    const setFieldGradient = useCallback(
        (
            slot: string,
            fieldId: string,
            declaredDefault: DataAppVizColorGradient,
            patch: Partial<DataAppVizColorGradient>,
        ) => {
            setFieldColorValues((prev) => {
                const binding = fieldMappingRef.current[slot];
                if (
                    binding !== fieldId &&
                    (!Array.isArray(binding) || !binding.includes(fieldId))
                )
                    return prev;
                return {
                    ...prev,
                    [slot]: {
                        ...prev[slot],
                        [fieldId]: {
                            ...prev[slot]?.[fieldId],
                            gradient: {
                                ...(prev[slot]?.[fieldId]?.gradient ??
                                    declaredDefault),
                                ...patch,
                            },
                        },
                    },
                };
            });
        },
        [],
    );

    const setFieldRules = useCallback(
        (
            slot: string,
            fieldId: string,
            declaredDefault: DataAppVizColorRule[],
            update: (rules: DataAppVizColorRule[]) => DataAppVizColorRule[],
        ) => {
            setFieldColorValues((prev) => {
                const binding = fieldMappingRef.current[slot];
                if (
                    binding !== fieldId &&
                    (!Array.isArray(binding) || !binding.includes(fieldId))
                )
                    return prev;
                const current = prev[slot]?.[fieldId];
                const rules = current?.rules ?? declaredDefault;
                const nextRules = update(rules);
                if (nextRules === rules) return prev;
                return {
                    ...prev,
                    [slot]: {
                        ...prev[slot],
                        [fieldId]: { ...current, rules: nextRules },
                    },
                };
            });
        },
        [],
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
            itemsMap,
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
            fieldMapping,
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
        effectiveFieldOptions,
        effectiveFieldColors,
        setFieldOption,
        setFieldGradient,
        setFieldRules,
        setOption,
        colorPaletteUuid,
        setColorPaletteUuid,
        palettes,
        colorPalette,
        handleRun,
        complete,
        isRunning,
        error,
    };
};
