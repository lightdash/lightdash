import {
    ChartType,
    deriveDataAppVizPivotConfig,
    diffDataAppVizSchema,
    FeatureFlags,
    getAppDisplayName,
    getEffectiveOptionValues,
    getItemId,
    pruneDataAppVizOptionValues,
    type ItemsMap,
} from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
import { useDataAppVizRenderMetadata } from '../../../features/chartTypes/hooks/useDataAppVizRender';
import {
    getUnboundRequiredDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from '../../../features/chartTypes/utils/autoMapDataAppVizFields';
import { chartTypeBuilderPath } from '../../../features/chartTypes/utils/chartTypeBuilderPath';
import { getDataAppVizFieldItems } from '../../../features/chartTypes/utils/getDataAppVizFieldItems';
import {
    explorerActions,
    selectChartTypeAuthoring,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { type SelectedDataAppViz } from '../../../hooks/useDataAppVizVisualizationConfig';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import Callout from '../../common/Callout';
import { useIsInsideChartGallery } from '../../common/ChartGallery/ChartGalleryContext';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../common/ColorPaletteSection';
import { useAddFieldsToQuery } from '../common/useAddFieldsToQuery';
import { type CustomChartTypeOption } from '../CustomChartType/customChartTypeOption';
import CustomChartTypeSection from '../CustomChartType/CustomChartTypeSection';
import { useSelectProjectChartType } from '../CustomChartType/useSelectProjectChartType';
import classes from './DataAppVizConfigTabs.module.css';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';
import DataAppVizSettings from './DataAppVizSettings';
import DataAppVizUpgradeNotice from './DataAppVizUpgradeNotice';

// Stable identity, so the field pools stay memoized before results land.
const NO_COLUMNS: ItemsMap = {};
// The chart-less authoring route answers with the latest renderable version,
// which is the only upgrade target a pinned chart can move to.
const LATEST_RENDER_TARGET = {
    isEmbedded: false,
    savedChartUuid: undefined,
};

export const ConfigTabs: FC = memo(() => {
    const projectUuid = useProjectUuid();
    const location = useLocation();
    const navigate = useNavigate();
    const { visualizationConfig, itemsMap, setChartType, setPivotDimensions } =
        useVisualizationContext();
    const { addableItems, isFieldPending } = useAddFieldsToQuery();
    const selectProjectChartType = useSelectProjectChartType();
    const dispatch = useExplorerDispatch();

    // Results' columns plus pending (not-yet-run) query fields, so a
    // just-assigned binding isn't stripped before its results land.
    const effectiveItemsMap = useMemo<ItemsMap>(() => {
        const pendingEntries = addableItems.flatMap((item) => {
            const id = getItemId(item);
            return isFieldPending(id) ? [[id, item] as const] : [];
        });
        if (pendingEntries.length === 0) return itemsMap ?? NO_COLUMNS;
        return { ...itemsMap, ...Object.fromEntries(pendingEntries) };
    }, [itemsMap, addableItems, isFieldPending]);
    const authoring = useExplorerSelector(selectChartTypeAuthoring);
    const isAuthoring = authoring !== null;

    const isDataAppViz = isDataAppVizVisualizationConfig(visualizationConfig);
    const dataAppVizUuid = isDataAppViz
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : null;
    const selectedVersion = isDataAppViz
        ? (visualizationConfig.chartConfig.validConfig?.dataAppVizVersion ??
          null)
        : null;

    const isAuthoringSelectedType =
        authoring !== null &&
        dataAppVizUuid !== null &&
        authoring.dataAppVizUuid === dataAppVizUuid;
    // The panel follows the same version as the chart. The builder can
    // temporarily preview a different version of this same viz; selecting a
    // type again clears its pin, so that path still asks for latest.
    const schemaVersion = isAuthoringSelectedType
        ? authoring.viewedVersion
        : selectedVersion;
    const { data: dataAppViz } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid,
        schemaVersion,
    );
    // Legacy unpinned charts follow latest already, and a type being authored
    // in place is moving under the chart anyway.
    const { data: latestRenderMetadata } = useDataAppVizRenderMetadata(
        projectUuid,
        selectedVersion !== null && !isAuthoringSelectedType
            ? dataAppVizUuid
            : null,
        LATEST_RENDER_TARGET,
    );
    const upgradeTarget =
        selectedVersion !== null &&
        !isAuthoringSelectedType &&
        latestRenderMetadata?.state === 'ready' &&
        latestRenderMetadata.version > selectedVersion
            ? latestRenderMetadata
            : null;
    const upgradeChanges = useMemo(
        () =>
            upgradeTarget && dataAppViz?.schema
                ? diffDataAppVizSchema(dataAppViz.schema, upgradeTarget.schema)
                : null,
        [upgradeTarget, dataAppViz],
    );

    const configOptions = useMemo(
        () => dataAppViz?.schema?.configOptions ?? [],
        [dataAppViz],
    );
    const colorPalette = dataAppViz?.schema?.colorPalette ?? null;
    const optionContractKey = useMemo(
        () => JSON.stringify({ configOptions, colorPalette }),
        [configOptions, colorPalette],
    );

    const canCreateApp = useCanCreateDataApp(projectUuid);
    // The gallery sidebar already shows the picked type, so the picker and
    // the type card are redundant there.
    const isInsideChartGallery = useIsInsideChartGallery();
    // In-place authoring needs data-apps; without it, fall back to the
    // standalone builder link the panel always offered.
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const canEditSelectedType = useCanEditDataApp(projectUuid, {
        spaceUuid: dataAppViz?.spaceUuid ?? null,
        createdByUserUuid: dataAppViz?.createdByUserUuid ?? null,
    });

    // Auto-binding cannot run without columns, and it only runs once, at pick
    // time — so picking now would leave the slots empty for good.
    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(effectiveItemsMap),
        [effectiveItemsMap],
    );
    const hasColumns = dimensions.length > 0 || metrics.length > 0;

    if (!isDataAppViz) return null;

    const {
        validConfig: selected,
        clearDataAppViz,
        setField,
        setOption,
        upgradeDataAppVizVersion,
    } = visualizationConfig.chartConfig;
    const fields = dataAppViz?.schema?.fields ?? [];

    const selectedOption: CustomChartTypeOption | null =
        selected !== null
            ? { kind: 'projectType', dataAppVizUuid: selected.dataAppVizUuid }
            : null;

    const selectedTypeTabs = (selectedViz: SelectedDataAppViz) => {
        const effectiveValues = getEffectiveOptionValues(
            configOptions,
            selectedViz.optionValues,
        );
        // A rebuild can change the contract under a stable uuid, so the selects
        // show the saved mapping reconciled the way the renderer does.
        const effectiveMapping = reconcileDataAppVizFieldMapping(
            fields,
            effectiveItemsMap,
            selectedViz.fieldMapping,
        );

        const handleFieldChange = (
            fieldName: string,
            fieldId: string | null,
        ) => {
            const nextMapping = { ...effectiveMapping };
            if (fieldId) nextMapping[fieldName] = fieldId;
            else delete nextMapping[fieldName];

            setField(fieldName, fieldId);
            setPivotDimensions(
                deriveDataAppVizPivotConfig(fields, nextMapping)?.columns,
            );
        };

        const unboundRequired = getUnboundRequiredDataAppVizFields(
            fields,
            effectiveMapping,
        );

        const handleUpgrade = () => {
            if (!upgradeTarget) return;
            const nextMapping = reconcileDataAppVizFieldMapping(
                upgradeTarget.schema.fields,
                effectiveItemsMap,
                selectedViz.fieldMapping,
            );
            upgradeDataAppVizVersion(
                upgradeTarget.version,
                nextMapping,
                pruneDataAppVizOptionValues(
                    upgradeTarget.schema.configOptions,
                    selectedViz.optionValues,
                ),
            );
            setPivotDimensions(
                deriveDataAppVizPivotConfig(
                    upgradeTarget.schema.fields,
                    nextMapping,
                )?.columns,
            );
        };

        const settings = (
            <Stack>
                {unboundRequired.length > 0 && (
                    <Callout variant="warning" hideIcon p="xs">
                        <Text fz="xs">
                            Map{' '}
                            {unboundRequired
                                .map((field) => field.label)
                                .join(', ')}{' '}
                            to render this chart type.
                        </Text>
                    </Callout>
                )}
                <DataAppVizSettings
                    itemsMap={effectiveItemsMap}
                    fields={fields}
                    fieldMapping={effectiveMapping}
                    onFieldChange={handleFieldChange}
                />
                {dataAppViz && !isInsideChartGallery && (
                    <Box className={classes.typeCard}>
                        <Text fz="xs" fw={500}>
                            {getAppDisplayName(
                                dataAppViz.name,
                                dataAppViz.dataAppVizUuid,
                            )}
                        </Text>
                        <Text fz="xs" c="dimmed" lh={1.5}>
                            {dataAppViz.description || 'No description'}
                        </Text>
                        {canEditSelectedType && !isInsideChartGallery && (
                            <Anchor
                                component={Link}
                                to={{
                                    pathname: chartTypeBuilderPath(
                                        projectUuid ?? '',
                                        dataAppViz.dataAppVizUuid,
                                    ),
                                    search: location.search,
                                }}
                                fz="xs"
                                fw={500}
                                mt={4}
                                display="inline-block"
                            >
                                Edit ↗
                            </Anchor>
                        )}
                    </Box>
                )}
            </Stack>
        );

        return (
            <>
                {upgradeChanges && dataAppViz && (
                    <DataAppVizUpgradeNotice
                        typeName={getAppDisplayName(
                            dataAppViz.name,
                            dataAppViz.dataAppVizUuid,
                        )}
                        changes={upgradeChanges}
                        onUpgrade={handleUpgrade}
                    />
                )}
                <DataAppVizOptionTabs
                    // Remount on a viz switch so no control keeps the previous
                    // viz's draft edit.
                    key={`${selectedViz.dataAppVizUuid}:${optionContractKey}`}
                    generalContent={settings}
                    configOptions={configOptions}
                    values={effectiveValues}
                    onChange={(name, value) =>
                        setOption(selectedViz.dataAppVizUuid, name, value)
                    }
                    colorPalette={colorPalette}
                    paletteControl={<ColorPaletteSection size="xs" />}
                />
            </>
        );
    };

    return (
        <Box className={classes.panel}>
            <Stack>
                {!isInsideChartGallery && (
                    <CustomChartTypeSection
                        projectUuid={projectUuid ?? ''}
                        selected={selectedOption}
                        selectedDataAppViz={dataAppViz ?? null}
                        hasColumns={hasColumns}
                        onSelectVega={() => setChartType(ChartType.CUSTOM)}
                        onSelectProjectType={(picked) =>
                            selectProjectChartType(picked, effectiveItemsMap)
                        }
                        onClear={() => {
                            clearDataAppViz();
                            setPivotDimensions(undefined);
                        }}
                        onCreateNew={
                            canCreateApp
                                ? () =>
                                      void navigate({
                                          pathname: chartTypeBuilderPath(
                                              projectUuid ?? '',
                                          ),
                                          search: location.search,
                                      })
                                : null
                        }
                        onBrowseGallery={() =>
                            void navigate(`/projects/${projectUuid}/gallery`)
                        }
                    />
                )}

                {/* With nothing selected the tabs would only be an empty row. */}
                {selected !== null ? (
                    selectedTypeTabs(selected)
                ) : isAuthoring ? (
                    <Text size="xs" c="dimmed">
                        Describe the chart type you need. Its bindings and
                        options appear here once the first version is ready.
                    </Text>
                ) : (
                    <Text size="xs" c="dimmed">
                        Pick a chart type above
                        {canCreateApp ? (
                            <>
                                , or create a new one in the{' '}
                                {isInsideChartGallery && dataAppsEnabled ? (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        size="xs"
                                        onClick={() =>
                                            dispatch(
                                                explorerActions.startChartTypeAuthoring(
                                                    { dataAppVizUuid: null },
                                                ),
                                            )
                                        }
                                    >
                                        builder
                                    </Anchor>
                                ) : (
                                    <Anchor
                                        component={Link}
                                        to={{
                                            pathname: chartTypeBuilderPath(
                                                projectUuid ?? '',
                                            ),
                                            search: location.search,
                                        }}
                                        size="xs"
                                    >
                                        builder
                                    </Anchor>
                                )}
                            </>
                        ) : null}
                        .
                    </Text>
                )}
            </Stack>
        </Box>
    );
});
