import {
    ChartType,
    deriveDataAppVizPivotConfig,
    FeatureFlags,
    getAppDisplayName,
    getEffectiveOptionValues,
    type ItemsMap,
} from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
import { reconcileDataAppVizFieldMapping } from '../../../features/chartTypes/utils/autoMapDataAppVizFields';
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
import { useIsInsideChartGallery } from '../../common/ChartGallery/ChartGalleryContext';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../common/ColorPaletteSection';
import { type CustomChartTypeOption } from '../CustomChartType/customChartTypeOption';
import CustomChartTypeSection from '../CustomChartType/CustomChartTypeSection';
import { useSelectProjectChartType } from '../CustomChartType/useSelectProjectChartType';
import classes from './DataAppVizConfigTabs.module.css';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';
import DataAppVizSettings from './DataAppVizSettings';

// Stable identity, so the field pools stay memoized before results land.
const NO_COLUMNS: ItemsMap = {};

export const ConfigTabs: FC = memo(() => {
    const projectUuid = useProjectUuid();
    const location = useLocation();
    const navigate = useNavigate();
    const { visualizationConfig, itemsMap, setChartType, setPivotDimensions } =
        useVisualizationContext();
    const selectProjectChartType = useSelectProjectChartType();
    const dispatch = useExplorerDispatch();
    const authoring = useExplorerSelector(selectChartTypeAuthoring);
    const isAuthoring = authoring !== null;

    const isDataAppViz = isDataAppVizVisualizationConfig(visualizationConfig);
    const dataAppVizUuid = isDataAppViz
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : null;

    // A chart renders the viz's latest ready version, so its options come from
    // that version's declaration — unless the builder is previewing an older
    // version of this same viz, whose own declaration the panel then follows.
    const authoringVersion =
        authoring !== null &&
        dataAppVizUuid !== null &&
        authoring.dataAppVizUuid === dataAppVizUuid
            ? authoring.viewedVersion
            : null;
    const { data: dataAppViz } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid ?? undefined,
        authoringVersion,
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
        () => getDataAppVizFieldItems(itemsMap ?? NO_COLUMNS),
        [itemsMap],
    );
    const hasColumns = dimensions.length > 0 || metrics.length > 0;

    if (!isDataAppViz) return null;

    const {
        validConfig: selected,
        clearDataAppViz,
        setField,
        setOption,
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
            itemsMap ?? NO_COLUMNS,
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

        const settings = (
            <Stack>
                <DataAppVizSettings
                    itemsMap={itemsMap ?? NO_COLUMNS}
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
                            selectProjectChartType(
                                picked,
                                itemsMap ?? NO_COLUMNS,
                            )
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
