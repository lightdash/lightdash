import {
    ChartType,
    deriveDataAppVizPivotConfig,
    getAppDisplayName,
    getEffectiveOptionValues,
    type ItemsMap,
} from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
import {
    autoMapDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from '../../../features/chartTypes/utils/autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from '../../../features/chartTypes/utils/getDataAppVizFieldItems';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../common/ColorPaletteSection';
import { type CustomChartTypeOption } from '../CustomChartType/customChartTypeOption';
import CustomChartTypeSection from '../CustomChartType/CustomChartTypeSection';
import classes from './DataAppVizConfigTabs.module.css';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';
import DataAppVizSettings from './DataAppVizSettings';

// Stable identity, so the field pools stay memoized before results land.
const NO_COLUMNS: ItemsMap = {};

export const ConfigTabs: FC = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { visualizationConfig, itemsMap, setChartType, setPivotDimensions } =
        useVisualizationContext();

    const isDataAppViz = isDataAppVizVisualizationConfig(visualizationConfig);
    const dataAppVizUuid = isDataAppViz
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : '';

    // A chart renders the viz's latest ready version, so its options come from
    // that version's declaration.
    const { data: dataAppViz } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid || undefined,
        null,
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
        setDataAppVizUuid,
        setField,
        setOption,
        fieldMapping,
        optionValues,
    } = visualizationConfig.chartConfig;
    const fields = dataAppViz?.schema?.fields ?? [];
    const effectiveValues = getEffectiveOptionValues(
        configOptions,
        optionValues,
    );
    // The contract can change under a stable uuid when the viz is rebuilt, so
    // what the selects show is the saved mapping reconciled against the
    // contract and columns in force now — the same value the renderer uses.
    const effectiveMapping = reconcileDataAppVizFieldMapping(
        fields,
        itemsMap ?? NO_COLUMNS,
        fieldMapping,
    );

    const setMappingPivotDimensions = (
        nextFields: typeof fields,
        nextMapping: typeof effectiveMapping,
    ) =>
        setPivotDimensions(
            deriveDataAppVizPivotConfig(nextFields, nextMapping)?.columns,
        );

    const handleFieldChange = (fieldName: string, fieldId: string | null) => {
        const nextMapping = { ...effectiveMapping };
        if (fieldId) nextMapping[fieldName] = fieldId;
        else delete nextMapping[fieldName];

        setField(fieldName, fieldId);
        setMappingPivotDimensions(fields, nextMapping);
    };

    const selectedOption: CustomChartTypeOption | null = dataAppVizUuid
        ? { kind: 'projectType', dataAppVizUuid }
        : null;

    const settings = (
        <Stack>
            <DataAppVizSettings
                dataAppVizUuid={dataAppVizUuid}
                itemsMap={itemsMap ?? NO_COLUMNS}
                fields={fields}
                fieldMapping={effectiveMapping}
                onFieldChange={handleFieldChange}
            />
            {dataAppViz && (
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
                    {canEditSelectedType && (
                        <Anchor
                            component={Link}
                            to={{
                                pathname: `/projects/${projectUuid}/chart-types/${dataAppViz.dataAppVizUuid}`,
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
        <Box className={classes.panel}>
            <Stack>
                <CustomChartTypeSection
                    projectUuid={projectUuid ?? ''}
                    selected={selectedOption}
                    selectedDataAppViz={dataAppViz ?? null}
                    hasColumns={hasColumns}
                    onSelectVega={() => setChartType(ChartType.CUSTOM)}
                    onSelectProjectType={(picked) => {
                        const pickedFields = picked.schema?.fields ?? [];
                        const pickedMapping = autoMapDataAppVizFields(
                            pickedFields,
                            itemsMap ?? NO_COLUMNS,
                        );
                        setDataAppVizUuid(picked.dataAppVizUuid, pickedMapping);
                        setMappingPivotDimensions(pickedFields, pickedMapping);
                    }}
                    onClear={() => {
                        setDataAppVizUuid('', {});
                        setPivotDimensions(undefined);
                    }}
                    onCreateNew={
                        canCreateApp
                            ? () =>
                                  void navigate({
                                      pathname: `/projects/${projectUuid}/chart-types/new`,
                                      search: location.search,
                                  })
                            : null
                    }
                    onBrowseGallery={() =>
                        void navigate(`/projects/${projectUuid}/gallery`)
                    }
                />

                {/* With nothing selected the tabs would only be an empty row. */}
                {dataAppVizUuid ? (
                    <DataAppVizOptionTabs
                        // Remount on a viz switch so no control keeps the
                        // previous viz's draft edit.
                        key={`${dataAppVizUuid}:${optionContractKey}`}
                        generalContent={settings}
                        configOptions={configOptions}
                        values={effectiveValues}
                        onChange={(name, value) =>
                            setOption(dataAppVizUuid, name, value)
                        }
                        colorPalette={colorPalette}
                        paletteControl={<ColorPaletteSection />}
                    />
                ) : (
                    <Text size="xs" c="dimmed">
                        Pick a chart type above
                        {canCreateApp ? (
                            <>
                                , or create a new one in the{' '}
                                <Anchor
                                    component={Link}
                                    to={{
                                        pathname: `/projects/${projectUuid}/chart-types/new`,
                                        search: location.search,
                                    }}
                                    size="xs"
                                >
                                    builder
                                </Anchor>
                            </>
                        ) : null}
                        .
                    </Text>
                )}
            </Stack>
        </Box>
    );
});
