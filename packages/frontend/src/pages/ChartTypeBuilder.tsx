import {
    assertUnreachable,
    ChartType,
    deriveDataAppVizPivotConfig,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    getDataAppVizFieldIds,
    getItemLabelWithoutTableName,
    pruneDataAppVizFieldOptionValues,
    type CreateSavedChartVersion,
    type AppChartReference,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import {
    Link,
    Navigate,
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import { validate as isUuidString } from 'uuid';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useAmbientAiEnabled } from '../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import { useSuggestedChartTypeExplore } from '../ee/features/ambientAi/hooks/useChartTypeSuggestions';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import {
    type ChartInputAiPick,
    type ChartInputsBinding,
    type ChartTypePreviewDataSource,
} from '../features/chartTypes/builder/ChartInputsList';
import ChartTypeBuilderHeader from '../features/chartTypes/builder/ChartTypeBuilderHeader';
import ChartTypeBuilderWorkspace from '../features/chartTypes/builder/ChartTypeBuilderWorkspace';
import { type ChartTypeRows } from '../features/chartTypes/builder/chartTypeRows';
import { ChartTypeRowsModal } from '../features/chartTypes/builder/ChartTypeSampleData';
import ConfigurePanel from '../features/chartTypes/builder/ConfigurePanel';
import {
    type AttachedExplore,
    type ExploreSourceControls,
    type PickedExplore,
} from '../features/chartTypes/builder/exploreSource';
import {
    type PickedSavedChart,
    type PreviewSource,
    type SavedChartSourceControls,
} from '../features/chartTypes/builder/savedChartSource';
import {
    getChartTypePromptContext,
    useAmbientFieldSuggestions,
} from '../features/chartTypes/builder/useAmbientFieldSuggestions';
import { useChartTypeBuilderWorkspace } from '../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { useConfigurePanelState } from '../features/chartTypes/builder/useConfigurePanelState';
import {
    useAttachedExplore,
    useExplorePreviewData,
    type LivePreviewRun,
} from '../features/chartTypes/builder/useExplorePreviewData';
import { useSavedChartBindingPreview } from '../features/chartTypes/builder/useSavedChartBindingPreview';
import { useSavedChartPreviewData } from '../features/chartTypes/builder/useSavedChartPreviewData';
import ChartTypePreviewTableModal from '../features/chartTypes/components/ChartTypePreviewTableModal';
import { type VizBuildRequest } from '../features/chartTypes/hooks/useDataAppVizBuild';
import { useDataAppVizResolvedColors } from '../features/chartTypes/hooks/useDataAppVizResolvedColors';
import {
    autoMapDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from '../features/chartTypes/utils/autoMapDataAppVizFields';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { buildExplorePreviewMetricQuery } from '../features/chartTypes/utils/explorePreviewQuery';
import { buildExplorerVizContext } from '../features/chartTypes/utils/explorerVizContext';
import { buildSampleVizContext } from '../features/chartTypes/utils/sampleVizContext';
import { mapSavedChartPreviewFields } from '../features/chartTypes/utils/savedChartPreviewFieldMapping';
import { vizBuildSampleRows } from '../features/chartTypes/utils/vizBuildSampleRows';
import {
    MERGE_URL_PARAM,
    serializeMergeState,
} from '../features/mergeQuery/context/mergeUrlState';
import { restoreSavedMerge } from '../features/mergeQuery/context/restoreSavedMerge';
import { useResolvedColorPalette } from '../hooks/appearance/useResolvedColorPalette';
import useToaster from '../hooks/toaster/useToaster';
import {
    DEFAULT_EMPTY_EXPLORE_CONFIG,
    getExplorerUrlFromCreateSavedChartVersion,
    parseChartFromExplorerSearchParams,
} from '../hooks/useExplorerRoute';
import { useOptionalProjectRoute } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import classes from './ChartTypeBuilder.module.css';

// Stable identities, so the workspace does not rebind between renders.
const NO_ITEMS: ItemsMap = {};
const NO_ROWS: ResultRow[] = [];
const NO_MAPPING: DataAppVizFieldMapping = {};
const NO_SAMPLE_ROWS: Record<string, string>[] = [];
const NO_AI_PICKS: Record<string, ChartInputAiPick> = {};
const NO_FIELD_NAMES: ReadonlySet<string> = new Set();

/** The saved chart a create session starts from, kept in the URL so a refresh
 *  and the `/new` → `/chart-types/:uuid` move both keep the selection. */
const SAVED_CHART_PARAM = 'savedChartUuid';
/** The explore a create session binds its inputs to. Only the name: the
 *  bindings decide the query, so a refresh re-derives it. Never set
 *  alongside a saved chart. */
const EXPLORE_PARAM = 'exploreName';

/**
 * The dedicated chart type builder. Mounted at both `chart-types/new`
 * (create) and `chart-types/:dataAppVizUuid` (edit); the create flow
 * adopts the new uuid into the URL once the first build is accepted.
 */
const ChartTypeBuilder: FC = () => {
    const { dataAppVizUuid: urlVizUuid } = useParams();
    const projectUuid = useProjectUuid();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const location = useLocation();
    const navigate = useNavigate();
    const [isPreviewTableOpen, setIsPreviewTableOpen] = useState(false);
    const explorerChart = useMemo(() => {
        try {
            const chart = parseChartFromExplorerSearchParams(location.search);
            return chart?.tableName ? chart : null;
        } catch {
            return null;
        }
    }, [location.search]);
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const isAmbientAiEnabled = useAmbientAiEnabled() === true;
    const canCreate = useCanCreateDataApp(projectUuid);

    // `useGetApp` accepts slugs, so the raw URL param is the right key.
    const appQuery = useGetApp(projectUuid, urlVizUuid);
    const appMeta = appQuery.data?.pages[0] ?? null;
    const canEdit = useCanEditDataApp(projectUuid, {
        spaceUuid: appMeta?.spaceUuid ?? null,
        createdByUserUuid: appMeta?.createdByUserUuid ?? null,
    });
    // The app this session's first build created, adopted into the URL. The
    // create permission that built it covers it until its row loads.
    const [claimedVizUuid, setClaimedVizUuid] = useState<string | null>(null);
    const canPreviewSavedChart =
        !dataAppsFlag.isLoading &&
        dataAppsFlag.data?.enabled === true &&
        (urlVizUuid === undefined ||
        (urlVizUuid === claimedVizUuid && appMeta === null)
            ? canCreate
            : appMeta !== null &&
              appMeta.template === DATA_APP_VIZ_TEMPLATE &&
              appMeta.registrySlug === null &&
              canEdit);
    // The uuid every uuid-keyed hook runs against; a slug URL resolves to it
    // once the app row loads.
    const activeVizUuid =
        appMeta?.appUuid ??
        (isUuidString(urlVizUuid ?? '') ? urlVizUuid : undefined);

    const [searchParams] = useSearchParams();
    const savedChartUuid = searchParams.get(SAVED_CHART_PARAM);
    const savedChartPreview = useSavedChartPreviewData({
        projectUuid,
        savedChartUuid,
        enabled: canPreviewSavedChart,
    });
    const sourcePreviewData = savedChartPreview.data;
    const exploreName =
        savedChartUuid === null ? searchParams.get(EXPLORE_PARAM) : null;
    const attachedExplore = useAttachedExplore({
        projectUuid,
        exploreName,
        enabled: canPreviewSavedChart,
    });
    const loadedExplore = attachedExplore.explore;
    const [isRowsModalOpen, setIsRowsModalOpen] = useState(false);
    const [sourceRevision, setSourceRevision] = useState(0);
    // Slots the author rebound by hand, layered over the automap.
    const [fieldMappingOverrides, setFieldMappingOverrides] =
        useState<DataAppVizFieldMapping>(NO_MAPPING);

    // The backend resolves the chart so the build sees its fields and
    // formatting; rows only travel when the composer's chip says so.
    const chartReference = useMemo<AppChartReference | undefined>(
        () =>
            savedChartUuid !== null
                ? { uuid: savedChartUuid, includeSampleData: false }
                : undefined,
        [savedChartUuid],
    );

    const workspace = useChartTypeBuilderWorkspace({
        projectUuid,
        dataAppVizUuid: activeVizUuid ?? null,
        creationExperience: 'chart_type_builder',
        itemsMap:
            sourcePreviewData.status === 'ready'
                ? sourcePreviewData.itemsMap
                : (loadedExplore?.itemsMap ?? NO_ITEMS),
        chartReference,
    });
    const { build, history, isBuilding, isHistoryOpen, setIncludeSampleData } =
        workspace;
    const panel = useConfigurePanelState(activeVizUuid ?? null);

    // One source at a time: attaching either clears the other's param.
    const setSourceParams = useCallback(
        (source: {
            savedChartUuid: string | null;
            exploreName: string | null;
        }) => {
            const next = new URLSearchParams(location.search);
            next.delete(SAVED_CHART_PARAM);
            next.delete(EXPLORE_PARAM);
            if (source.savedChartUuid !== null) {
                next.set(SAVED_CHART_PARAM, source.savedChartUuid);
            }
            if (source.exploreName !== null) {
                next.set(EXPLORE_PARAM, source.exploreName);
            }
            setSourceRevision((current) => current + 1);
            setIncludeSampleData(false);
            setFieldMappingOverrides(NO_MAPPING);
            void navigate(
                { pathname: location.pathname, search: next.toString() },
                { replace: true },
            );
        },
        [location.pathname, location.search, navigate, setIncludeSampleData],
    );

    const setSavedChartParam = useCallback(
        (uuid: string | null) =>
            setSourceParams({ savedChartUuid: uuid, exploreName: null }),
        [setSourceParams],
    );

    // On `/new`, move to the edit route as soon as the build claims an app so
    // a refresh mid-build lands on the in-progress version.
    useEffect(() => {
        if (!urlVizUuid && build.appUuid && projectUrlIdentifier) {
            setClaimedVizUuid(build.appUuid);
            void navigate(
                {
                    pathname: chartTypeBuilderPath(
                        projectUrlIdentifier,
                        build.appUuid,
                    ),
                    search: location.search,
                },
                { replace: true },
            );
        }
    }, [
        urlVizUuid,
        build.appUuid,
        projectUrlIdentifier,
        location.search,
        navigate,
    ]);

    const colorPalette = useResolvedColorPalette(
        projectUuid,
        panel.colorPaletteUuid,
    );
    const schema = workspace.dataAppViz?.schema ?? null;

    // With an explore attached, the bindings are the query. They bind against
    // the explore's whole field list, never the run's columns, so the field
    // set depends only on the schema, the explore and the author's picks and
    // cannot chase its own results. Ambient AI's picks lead where it answered
    // and the automap fills the rest; inputs it is still picking for stay
    // unbound, and the query holds, until it does. The field list is not yet
    // a build reference; that is backend work.
    const promptContext = useMemo(
        () =>
            getChartTypePromptContext(
                history.versions,
                workspace.previewVersion,
            ),
        [history.versions, workspace.previewVersion],
    );
    // Without a built version there is no prompt to suggest a table for.
    const suggestTable = useMemo(
        () =>
            isAmbientAiEnabled &&
            history.latestReadyVersion !== null &&
            schema !== null &&
            schema.fields.length > 0
                ? { ...promptContext, fields: schema.fields }
                : null,
        [isAmbientAiEnabled, history.latestReadyVersion, schema, promptContext],
    );
    const suggestedExplore = useSuggestedChartTypeExplore(
        projectUuid,
        suggestTable,
    );
    const fieldSuggestions = useAmbientFieldSuggestions({
        projectUuid,
        enabled: isAmbientAiEnabled && canPreviewSavedChart,
        sourceKey:
            exploreName === null ? null : `${exploreName}:${sourceRevision}`,
        explore: loadedExplore,
        fields: schema?.fields ?? null,
        context: promptContext,
        suggestedExploreName: suggestedExplore?.exploreName ?? null,
    });
    const { pendingFieldNames, seed: suggestedMapping } = fieldSuggestions;
    const isPickingFields = pendingFieldNames.size > 0;
    const exploreFieldMapping = useMemo(() => {
        if (!schema || !loadedExplore) return NO_MAPPING;
        const fields = schema.fields.filter(
            (field) => !pendingFieldNames.has(field.name),
        );
        return reconcileDataAppVizFieldMapping(fields, loadedExplore.itemsMap, {
            ...autoMapDataAppVizFields(
                fields,
                loadedExplore.itemsMap,
                suggestedMapping,
            ),
            ...fieldMappingOverrides,
        });
    }, [
        schema,
        loadedExplore,
        fieldMappingOverrides,
        pendingFieldNames,
        suggestedMapping,
    ]);
    const exploreFieldIds = useMemo(
        () => [
            ...new Set(
                Object.values(exploreFieldMapping).flatMap(
                    getDataAppVizFieldIds,
                ),
            ),
        ],
        [exploreFieldMapping],
    );
    const explorePreview = useExplorePreviewData({
        projectUuid,
        explore: loadedExplore,
        schema,
        fieldMapping: exploreFieldMapping,
        isPickingFields,
    });
    const exploreRun =
        explorePreview.run.status === 'ready' ? explorePreview.run : null;
    const sourceRun: LivePreviewRun | null =
        sourcePreviewData.status === 'ready' ? sourcePreviewData : exploreRun;

    const sourceChart =
        sourcePreviewData.status === 'ready'
            ? sourcePreviewData.sourceChart
            : null;
    // Source bindings first, then whatever the author rebound in the sidebar. An
    // explore's bindings keep only the fields its latest run returned.
    const previewFieldMapping = useMemo(() => {
        if (!schema || !sourceRun) return NO_MAPPING;
        if (exploreName !== null) {
            return reconcileDataAppVizFieldMapping(
                schema.fields,
                sourceRun.itemsMap,
                exploreFieldMapping,
            );
        }
        const automapped = mapSavedChartPreviewFields({
            fields: schema.fields,
            itemsMap: sourceRun.itemsMap,
            sourceChart,
            dataAppVizUuid: activeVizUuid ?? null,
        });
        return reconcileDataAppVizFieldMapping(
            schema.fields,
            sourceRun.itemsMap,
            {
                ...automapped,
                ...fieldMappingOverrides,
            },
        );
    }, [
        schema,
        sourceRun,
        exploreName,
        exploreFieldMapping,
        fieldMappingOverrides,
        sourceChart,
        activeVizUuid,
    ]);
    const {
        data: previewData,
        retry: retryPreview,
        fieldMapping: savedAppliedFieldMapping,
    } = useSavedChartBindingPreview({
        projectUuid,
        savedChartUuid,
        source: savedChartPreview,
        schema,
        fieldMapping: previewFieldMapping,
    });
    const liveRun: LivePreviewRun | null =
        previewData.status === 'ready' ? previewData : exploreRun;
    const renderedFieldMapping =
        savedChartUuid !== null
            ? savedAppliedFieldMapping
            : (exploreRun?.fieldMapping ?? previewFieldMapping);

    const { showToastError } = useToaster();
    const previewError =
        previewData.status === 'error' ? previewData.message : null;
    useEffect(() => {
        if (previewError === null) return;
        showToastError({
            title: 'Couldn’t load the saved chart’s data',
            subtitle: previewError,
        });
    }, [previewError, showToastError]);
    const exploreError =
        explorePreview.run.status === 'error'
            ? explorePreview.run.message
            : null;
    useEffect(() => {
        if (exploreError === null) return;
        showToastError({
            title: 'Couldn’t run the table query',
            subtitle: exploreError,
        });
    }, [exploreError, showToastError]);

    // Inspect the rendered pivot, or the source rows before a schema exists.
    const liveRows = useMemo<ChartTypeRows | null>(
        () =>
            liveRun
                ? {
                      rows: liveRun.rows,
                      pivotDetails: liveRun.pivotDetails,
                      labels: Object.fromEntries(
                          Object.entries(liveRun.itemsMap).map(([id, item]) => [
                              id,
                              getItemLabelWithoutTableName(item),
                          ]),
                      ),
                  }
                : null,
        [liveRun],
    );

    const resolvedColors = useDataAppVizResolvedColors({
        itemsMap: liveRun?.itemsMap ?? NO_ITEMS,
        rows: liveRun?.rows ?? NO_ROWS,
        fieldMapping: renderedFieldMapping,
        pivotDetails: liveRun?.pivotDetails ?? null,
        colorPalette,
    });
    const vizPreviewData =
        workspace.history.versions.find(
            (version) => version.version === workspace.previewVersion,
        )?.resources?.vizPreview ?? null;
    // Real rows when the saved chart's query has run; the fabricated sample
    // otherwise (tuned by the version's vizPreview resource when present).
    // Rebuilt on any option or palette edit.
    const previewContext = useMemo(() => {
        if (!schema) return null;
        if (!liveRun) {
            if (savedChartUuid !== null || exploreName !== null) return null;
            return buildSampleVizContext(
                schema,
                colorPalette,
                panel.optionValues,
                vizPreviewData,
                panel.fieldOptionValues,
            );
        }
        return buildExplorerVizContext({
            schema,
            itemsMap: liveRun.itemsMap,
            persistedFieldMapping: renderedFieldMapping,
            rows: liveRun.rows,
            pivotDetails: liveRun.pivotDetails,
            colorPalette,
            optionValues: panel.optionValues,
            fieldOptionValues: panel.fieldOptionValues,
            resolvedColors,
        });
    }, [
        schema,
        savedChartUuid,
        exploreName,
        liveRun,
        colorPalette,
        panel.optionValues,
        panel.fieldOptionValues,
        resolvedColors,
        renderedFieldMapping,
        vizPreviewData,
    ]);

    // What the next build is told it is changing: the schema on screen, bound
    // to the columns the run returned.
    const latestReadySchema =
        history.versions.find(
            (version) => version.version === history.latestReadyVersion,
        )?.resources?.vizSchema ??
        (workspace.viewedVersion === null && !workspace.isFetchingSchema
            ? schema
            : null);
    const buildFieldMapping = useMemo(() => {
        if (exploreName !== null) {
            if (!latestReadySchema || !loadedExplore) return NO_MAPPING;
            return reconcileDataAppVizFieldMapping(
                latestReadySchema.fields,
                loadedExplore.itemsMap,
                {
                    ...autoMapDataAppVizFields(
                        latestReadySchema.fields,
                        loadedExplore.itemsMap,
                        suggestedMapping,
                    ),
                    ...fieldMappingOverrides,
                },
            );
        }
        if (!latestReadySchema || !sourceRun) return NO_MAPPING;
        const automapped = mapSavedChartPreviewFields({
            fields: latestReadySchema.fields,
            itemsMap: sourceRun.itemsMap,
            sourceChart,
            dataAppVizUuid: activeVizUuid ?? null,
        });
        return reconcileDataAppVizFieldMapping(
            latestReadySchema.fields,
            sourceRun.itemsMap,
            { ...automapped, ...fieldMappingOverrides },
        );
    }, [
        exploreName,
        latestReadySchema,
        loadedExplore,
        sourceRun,
        fieldMappingOverrides,
        suggestedMapping,
        sourceChart,
        activeVizUuid,
    ]);
    const currentBuildContext: VizBuildRequest['context'] =
        (liveRun || loadedExplore) && latestReadySchema
            ? { schema: latestReadySchema, fieldMapping: buildFieldMapping }
            : undefined;
    const sampleRows = useMemo(
        () =>
            liveRun
                ? vizBuildSampleRows(liveRun.rows, buildFieldMapping)
                : NO_SAMPLE_ROWS,
        [liveRun, buildFieldMapping],
    );

    const previewDataSource = useMemo<ChartTypePreviewDataSource>(() => {
        if (exploreName !== null) {
            const label = loadedExplore?.label ?? exploreName;
            const { run } = explorePreview;
            switch (run.status) {
                case 'idle':
                    return { kind: 'sample' };
                case 'running':
                    return { kind: 'loading', chartName: label };
                case 'error':
                    return {
                        kind: 'error',
                        chartName: label,
                        message: run.message,
                    };
                case 'ready':
                    return {
                        kind: 'live',
                        chartName: label,
                        rowCount: run.rowCount,
                    };
                default:
                    return assertUnreachable(
                        run,
                        'Unknown explore preview status',
                    );
            }
        }
        switch (previewData.status) {
            case 'notRun':
                return { kind: 'sample' };
            case 'running':
                return { kind: 'loading', chartName: previewData.chartName };
            case 'error':
                return {
                    kind: 'error',
                    chartName: previewData.chartName,
                    message: previewData.message,
                };
            case 'ready':
                return {
                    kind: 'live',
                    chartName: previewData.chartName,
                    rowCount: previewData.rowCount,
                };
            default:
                return assertUnreachable(
                    previewData,
                    'Unknown saved chart preview status',
                );
        }
    }, [previewData, exploreName, explorePreview, loadedExplore]);

    // One object for every surface that offers the saved chart: the canvas
    // card, the composer chip and the sidebar.
    const savedChartSource = useMemo<SavedChartSourceControls>(() => {
        const previewSource: PreviewSource =
            savedChartUuid !== null ? 'chart' : 'sample';
        const attach = (chart: PickedSavedChart) =>
            setSavedChartParam(chart.uuid);
        const controls = {
            sourceIdentity:
                savedChartUuid === null
                    ? null
                    : `${projectUuid}:${savedChartUuid}:${sourceRevision}`,
            attach,
            detach: () => setSavedChartParam(null),
            viewRows: () => setIsRowsModalOpen(true),
            retry: retryPreview,
            includeRows: workspace.includeSampleData,
            setIncludeRows: setIncludeSampleData,
            previewSource,
        };
        if (savedChartUuid === null) return { ...controls, attached: null };
        switch (previewData.status) {
            case 'notRun':
                return { ...controls, attached: null };
            case 'running':
                return {
                    ...controls,
                    attached: {
                        status: 'running',
                        uuid: savedChartUuid,
                        chartName: previewData.chartName ?? 'Saved chart',
                        spaceName: previewData.spaceName,
                        rowCount: null,
                        columns: [],
                        ranAt: null,
                        message: null,
                    },
                };
            case 'error':
                return {
                    ...controls,
                    attached: {
                        status: 'error',
                        uuid: savedChartUuid,
                        chartName: previewData.chartName ?? 'Saved chart',
                        spaceName: previewData.spaceName,
                        rowCount: null,
                        columns: [],
                        ranAt: null,
                        message: previewData.message,
                    },
                };
            case 'ready':
                return {
                    ...controls,
                    attached: {
                        status: 'ready',
                        uuid: savedChartUuid,
                        chartName: previewData.chartName ?? 'Saved chart',
                        spaceName: previewData.spaceName,
                        rowCount: previewData.rowCount,
                        columns: previewData.columns,
                        ranAt: previewData.ranAt,
                        message: null,
                    },
                };
            default:
                return assertUnreachable(
                    previewData,
                    'Unknown saved chart preview status',
                );
        }
    }, [
        previewData,
        projectUuid,
        retryPreview,
        setSavedChartParam,
        workspace.includeSampleData,
        setIncludeSampleData,
        savedChartUuid,
        sourceRevision,
    ]);

    const exploreSource = useMemo<ExploreSourceControls>(() => {
        const { run } = explorePreview;
        const attached: AttachedExplore | null =
            exploreName === null
                ? null
                : {
                      name: exploreName,
                      label: loadedExplore?.label ?? exploreName,
                      joinedTableLabels: loadedExplore?.joinedTableLabels ?? [],
                      fieldCount: loadedExplore?.fields.length ?? 0,
                      queriedFieldCount: exploreFieldIds.length,
                      status:
                          attachedExplore.error !== null ||
                          run.status === 'error'
                              ? 'error'
                              : loadedExplore === null
                                ? 'loading'
                                : run.status,
                      isRunning: explorePreview.isRunning,
                      isPickingFields,
                      rowCount: run.status === 'ready' ? run.rowCount : null,
                      ranAt: run.status === 'ready' ? run.ranAt : null,
                      message:
                          attachedExplore.error ??
                          (run.status === 'error' ? run.message : null),
                  };
        return {
            sourceIdentity:
                exploreName === null
                    ? null
                    : `${projectUuid}:explore:${exploreName}:${sourceRevision}`,
            attached,
            previewSource: exploreName !== null ? 'explore' : 'sample',
            suggestTable,
            includeRows: workspace.includeSampleData,
            setIncludeRows: setIncludeSampleData,
            attach: (explore: PickedExplore) =>
                setSourceParams({
                    savedChartUuid: null,
                    exploreName: explore.name,
                }),
            detach: () =>
                setSourceParams({ savedChartUuid: null, exploreName: null }),
            viewRows: () => setIsRowsModalOpen(true),
            retry:
                attachedExplore.error !== null
                    ? attachedExplore.retry
                    : explorePreview.retry,
        };
    }, [
        attachedExplore,
        exploreFieldIds,
        explorePreview,
        exploreName,
        isPickingFields,
        loadedExplore,
        projectUuid,
        setIncludeSampleData,
        setSourceParams,
        sourceRevision,
        suggestTable,
        workspace.includeSampleData,
    ]);

    const onFieldChange = useCallback(
        (fieldName: string, fieldId: string | string[] | null) =>
            setFieldMappingOverrides((current) => ({
                ...current,
                // An empty array is an explicit clear, for a single slot as
                // much as a multiple one.
                [fieldName]: fieldId ?? [],
            })),
        [],
    );

    // With an explore attached, every slot lists the whole explore: the run's
    // fields first, the rest under "Add to query". Binding one of those
    // changes the query, which re-runs; nothing rebuilds.
    // A suggestion's mark stays while the input holds exactly what was picked
    // and the author has not chosen it themselves.
    const aiPicks = useMemo(() => {
        if (!schema || !loadedExplore) return NO_AI_PICKS;
        const labelOf = (id: string) =>
            loadedExplore.fields.find((field) => field.id === id)?.label ?? id;
        const picks = Object.fromEntries(
            schema.fields.flatMap((field) => {
                const pick = fieldSuggestions.picks[field.name];
                if (!pick || fieldMappingOverrides[field.name] !== undefined) {
                    return [];
                }
                const bound = getDataAppVizFieldIds(
                    exploreFieldMapping[field.name],
                );
                if (
                    bound.length !== pick.fieldIds.length ||
                    bound.some((id, index) => id !== pick.fieldIds[index])
                ) {
                    return [];
                }
                const alternativeIds = pick.alternatives;
                return [
                    [
                        field.name,
                        {
                            reason: pick.reason,
                            alsoFits: alternativeIds.map(labelOf),
                            suggestedItems: [
                                ...pick.fieldIds,
                                ...alternativeIds,
                            ].flatMap((id) => {
                                const item = loadedExplore.itemsMap[id];
                                return item ? [item] : [];
                            }),
                        },
                    ] as const,
                ];
            }),
        );
        return Object.keys(picks).length > 0 ? picks : NO_AI_PICKS;
    }, [
        schema,
        loadedExplore,
        fieldSuggestions.picks,
        fieldMappingOverrides,
        exploreFieldMapping,
    ]);

    const inputsBinding = useMemo<ChartInputsBinding | null>(() => {
        if (exploreName !== null) {
            if (!loadedExplore || !schema) return null;
            const runItems = exploreRun?.itemsMap ?? NO_ITEMS;
            const bound = new Set(exploreFieldIds);
            return {
                itemsMap: runItems,
                fieldMapping: exploreFieldMapping,
                onFieldChange,
                aiPicks,
                pickingFieldNames: pendingFieldNames,
                addToQuery: {
                    items: loadedExplore.fields
                        .filter((field) => !(field.id in runItems))
                        .map((field) => field.item),
                    isPending: (fieldId) =>
                        explorePreview.isRunning &&
                        bound.has(fieldId) &&
                        !(fieldId in runItems),
                },
            };
        }
        return sourceRun
            ? {
                  itemsMap: sourceRun.itemsMap,
                  fieldMapping: previewFieldMapping,
                  onFieldChange,
                  addToQuery: null,
                  aiPicks: NO_AI_PICKS,
                  pickingFieldNames: NO_FIELD_NAMES,
              }
            : null;
    }, [
        aiPicks,
        pendingFieldNames,
        exploreFieldIds,
        exploreFieldMapping,
        exploreName,
        explorePreview.isRunning,
        exploreRun,
        loadedExplore,
        onFieldChange,
        previewFieldMapping,
        sourceRun,
        schema,
    ]);

    const getExplorerDestination = useCallback(
        (pickedTable: string | null) => {
            if (!activeVizUuid) return null;
            let chart: CreateSavedChartVersion | null = null;
            let fieldMapping = NO_MAPPING;
            if (exploreName !== null && loadedExplore) {
                chart = {
                    ...DEFAULT_EMPTY_EXPLORE_CONFIG,
                    tableName: loadedExplore.name,
                    metricQuery: buildExplorePreviewMetricQuery(
                        loadedExplore.name,
                        loadedExplore.itemsMap,
                        exploreFieldIds,
                    ),
                    tableConfig: { columnOrder: exploreFieldIds },
                };
                fieldMapping = exploreFieldMapping;
            } else if (savedChartUuid !== null && sourceChart) {
                chart = {
                    tableName: sourceChart.originalMetricQuery.exploreName,
                    metricQuery: sourceChart.originalMetricQuery,
                    chartConfig: sourceChart.chartConfig,
                    tableConfig: {
                        columnOrder: Object.keys(
                            sourceRun?.itemsMap ?? NO_ITEMS,
                        ),
                    },
                    parameters: sourceChart.parameters,
                    merge: sourceChart.merge,
                };
                fieldMapping = previewFieldMapping;
            } else if (exploreName === null && savedChartUuid === null) {
                chart =
                    explorerChart ??
                    (pickedTable
                        ? {
                              ...DEFAULT_EMPTY_EXPLORE_CONFIG,
                              tableName: pickedTable,
                              metricQuery: {
                                  ...DEFAULT_EMPTY_EXPLORE_CONFIG.metricQuery,
                                  exploreName: pickedTable,
                              },
                          }
                        : null);
            }
            if (!chart) return null;
            // Values keyed by the previewed fields only carry over when bound.
            const fieldOptionValues = schema
                ? pruneDataAppVizFieldOptionValues(
                      schema.fields,
                      fieldMapping,
                      panel.fieldOptionValues,
                  )
                : null;
            const destination = getExplorerUrlFromCreateSavedChartVersion(
                projectUuid,
                {
                    ...chart,
                    pivotConfig: schema
                        ? deriveDataAppVizPivotConfig(
                              schema.fields,
                              fieldMapping,
                          )
                        : undefined,
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizUuid: activeVizUuid,
                            ...(workspace.previewVersion !== null
                                ? {
                                      dataAppVizVersion:
                                          workspace.previewVersion,
                                  }
                                : {}),
                            fieldMapping,
                            optionValues: panel.optionValues,
                            ...(fieldOptionValues &&
                            Object.keys(fieldOptionValues).length > 0
                                ? { fieldOptionValues }
                                : {}),
                        },
                    },
                },
                false,
            );
            const params = new URLSearchParams(destination.search);
            params.delete(SAVED_CHART_PARAM);
            params.delete(EXPLORE_PARAM);
            params.delete('dataAppVizUuid');
            params.set('chartSidebar', 'configure');
            const merge = chart.merge ? restoreSavedMerge(chart.merge) : null;
            if (merge) params.set(MERGE_URL_PARAM, serializeMergeState(merge));
            else params.delete(MERGE_URL_PARAM);
            if (panel.colorPaletteUuid)
                params.set('colorPaletteUuid', panel.colorPaletteUuid);
            else params.delete('colorPaletteUuid');
            return { ...destination, search: params.toString() };
        },
        [
            activeVizUuid,
            exploreName,
            loadedExplore,
            exploreFieldIds,
            exploreFieldMapping,
            savedChartUuid,
            sourceChart,
            sourceRun,
            previewFieldMapping,
            explorerChart,
            projectUuid,
            schema,
            workspace.previewVersion,
            panel.optionValues,
            panel.fieldOptionValues,
            panel.colorPaletteUuid,
        ],
    );
    const explorerDestination = useMemo(
        () => getExplorerDestination(null),
        [getExplorerDestination],
    );

    if (!projectUuid) return null;
    if (dataAppsFlag.isLoading) return null;
    if (!dataAppsFlag.data?.enabled) {
        return (
            <Navigate to={`/projects/${projectUrlIdentifier}/home`} replace />
        );
    }

    const isCreateFlow = urlVizUuid === undefined && build.appUuid === null;
    if (isCreateFlow && !canCreate) {
        return (
            <Navigate
                to={`/projects/${projectUrlIdentifier}/chart-types`}
                replace
            />
        );
    }

    if (appQuery.error?.error.statusCode === 404) {
        return (
            <Box className={classes.root}>
                <Box className={classes.notFound}>
                    <SuboptimalState
                        title="Chart type not found"
                        description="It may have been deleted, or the link is wrong."
                        action={
                            <Button
                                component={Link}
                                to={`/projects/${projectUrlIdentifier}/chart-types`}
                                variant="default"
                            >
                                Back to chart types
                            </Button>
                        }
                    />
                </Box>
            </Box>
        );
    }

    if (appMeta) {
        // A data app that isn't a chart type belongs in the app builder.
        if (appMeta.template !== DATA_APP_VIZ_TEMPLATE) {
            return (
                <Navigate
                    to={`/projects/${projectUuid}/apps/${appMeta.appUuid}`}
                    replace
                />
            );
        }
        if (!canEdit) {
            return (
                <Navigate
                    to={`/projects/${projectUrlIdentifier}/chart-types`}
                    replace
                />
            );
        }
        // Server-enforced (registry apps are read-only); this only keeps
        // the builder UI from being reached for an official chart type.
        if (appMeta.registrySlug !== null) {
            return (
                <Navigate
                    to={`/projects/${projectUrlIdentifier}/chart-types`}
                    replace
                />
            );
        }
    }

    // An opened chart type is neither new nor editable until its row loads;
    // the one a first build just claimed is already on screen.
    const isResolvingApp =
        urlVizUuid !== undefined &&
        appMeta === null &&
        !appQuery.error &&
        build.appUuid === null &&
        history.versions.length === 0;

    // Remounted per viz so the selected tab belongs to the declaration on screen.
    const configurePanel = schema ? (
        <ConfigurePanel
            key={activeVizUuid}
            schema={schema}
            optionValues={panel.optionValues}
            onOptionChange={panel.onOptionChange}
            fieldOptionValues={panel.fieldOptionValues}
            onFieldOptionChange={panel.onFieldOptionChange}
            colorPaletteUuid={panel.colorPaletteUuid}
            onPaletteChange={panel.onPaletteChange}
            resolvedColorPalette={colorPalette}
            previewContext={previewContext}
            isStale={workspace.isFetchingSchema}
            previewDataSource={previewDataSource}
            savedChartSource={savedChartSource}
            exploreSource={exploreSource}
            inputsBinding={inputsBinding}
        />
    ) : null;

    const backLink = explorerChart
        ? {
              label: 'Explorer',
              to: explorerDestination ?? {
                  pathname: `/projects/${projectUuid}/tables/${explorerChart.tableName}`,
                  search: location.search,
              },
          }
        : {
              label: 'Chart types',
              to: `/projects/${projectUrlIdentifier}/chart-types`,
          };

    return (
        <Box className={classes.root}>
            <DocumentTitle title="Chart Studio" />
            <ChartTypeBuilderHeader
                projectUuid={projectUuid}
                appUuidOrSlug={urlVizUuid}
                backLink={backLink}
                app={appMeta}
                latestReadyVersion={history.latestReadyVersion}
                hasHistory={workspace.hasHistory}
                isHistoryOpen={isHistoryOpen}
                isBuilding={isBuilding}
                isCreating={isBuilding && history.latestReadyVersion === null}
                upgrade={
                    activeVizUuid && history.latestReadyVersion !== null
                        ? { ...workspace.sdkUpgradeOffer, disabled: isBuilding }
                        : null
                }
                onUpgradeStarted={workspace.openHistory}
                onToggleHistory={workspace.toggleHistory}
                previewInExplorerLink={explorerDestination}
                previewInExplorerDisabled={
                    explorerDestination === null &&
                    (savedChartUuid !== null || exploreName !== null)
                }
                onPreviewInExplorer={
                    activeVizUuid ? () => setIsPreviewTableOpen(true) : null
                }
            />
            {!isResolvingApp && (
                <ChartTypeBuilderWorkspace
                    projectUuid={projectUuid}
                    workspace={workspace}
                    previewContext={previewContext}
                    sampleRows={sampleRows}
                    currentBuildContext={currentBuildContext}
                    savedChartSource={savedChartSource}
                    exploreSource={exploreSource}
                    syncPreviewUrlState
                    configurePanel={configurePanel}
                />
            )}
            <ChartTypeRowsModal
                data={liveRows}
                opened={isRowsModalOpen && liveRows !== null}
                onClose={() => setIsRowsModalOpen(false)}
                title="Query results"
                subtitle={`${liveRows?.pivotDetails ? 'Pivoted preview of rows' : 'Rows'} returned by ${
                    exploreSource.attached?.label ??
                    savedChartSource.attached?.chartName ??
                    'the saved chart'
                }.`}
            />
            {isPreviewTableOpen && activeVizUuid && (
                <ChartTypePreviewTableModal
                    projectUuid={projectUuid}
                    dataAppVizUuid={activeVizUuid}
                    registrySlug={appMeta?.registrySlug ?? null}
                    onClose={() => setIsPreviewTableOpen(false)}
                    onSelectTable={(tableName) => {
                        const destination = getExplorerDestination(tableName);
                        if (destination) void navigate(destination);
                    }}
                />
            )}
        </Box>
    );
};

export default ChartTypeBuilder;
