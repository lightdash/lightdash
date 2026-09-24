import {
    ChartType,
    deriveDataAppVizPivotConfig,
    diffDataAppVizSchema,
    FeatureFlags,
    getAppDisplayName,
    getDataAppVizFieldIds,
    getEffectiveOptionValues,
    getItemId,
    getItemLabelWithoutTableName,
    isOfficialChartType,
    pruneDataAppVizFieldOptionValues,
    pruneDataAppVizOptionValues,
    type DataAppVizField,
    type ItemsMap,
} from '@lightdash/common';
import { Anchor, Box, Stack, Text } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
import { useDataAppVizRenderMetadata } from '../../../features/chartTypes/hooks/useDataAppVizRender';
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
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
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
import DataAppVizFieldOptions from './DataAppVizFieldOptions';
import DataAppVizInputGuidance from './DataAppVizInputGuidance';
import DataAppVizLibraryUpgradeNotice from './DataAppVizLibraryUpgradeNotice';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';
import DataAppVizSettings from './DataAppVizSettings';
import DataAppVizUpgradeNotice from './DataAppVizUpgradeNotice';

// Stable identity, so the field pools stay memoized before results land.
const NO_COLUMNS: ItemsMap = {};

export const ConfigTabs: FC = memo(() => {
    const projectUuid = useProjectUuid();
    const { embedToken } = useEmbed();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const location = useLocation();
    const navigate = useNavigate();
    const {
        visualizationConfig,
        itemsMap,
        colorPalette: resolvedColorPalette,
        setChartType,
        setPivotDimensions,
    } = useVisualizationContext();
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
    const { data: dataAppViz, error: dataAppVizError } =
        useDataAppVisualization(projectUuid, dataAppVizUuid, schemaVersion);
    // The selected type was uninstalled or deleted; showing its (empty)
    // settings would read as "no fields to map", which is not what happened.
    const selectedTypeRemoved = dataAppVizError?.error.statusCode === 404;
    // Legacy unpinned charts follow latest already, and a type being authored
    // in place is moving under the chart anyway.
    const { data: latestRenderMetadata } = useDataAppVizRenderMetadata(
        projectUuid,
        selectedVersion !== null && !isAuthoringSelectedType
            ? dataAppVizUuid
            : null,
        { isEmbedded: !!embedToken, savedChartUuid: undefined },
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
        () =>
            JSON.stringify({
                configOptions,
                colorPalette,
                fieldOptions: dataAppViz?.schema?.fields.map(
                    (field) => field.configOptions,
                ),
            }),
        [configOptions, colorPalette, dataAppViz],
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
        setFieldOption,
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
        const effectiveBindings = reconcileDataAppVizFieldMapping(
            fields,
            effectiveItemsMap,
            selectedViz.fieldMapping,
        );

        const handleFieldChange = (
            fieldName: string,
            fieldId: string | string[] | null,
        ) => {
            const nextFieldMapping = { ...effectiveBindings };
            if (Array.isArray(fieldId)) {
                nextFieldMapping[fieldName] = fieldId;
            } else if (fieldId !== null) {
                nextFieldMapping[fieldName] = fieldId;
            } else {
                delete nextFieldMapping[fieldName];
            }

            setField(fieldName, fieldId);
            setPivotDimensions(
                deriveDataAppVizPivotConfig(fields, nextFieldMapping)?.columns,
            );
        };

        const handleUpgrade = () => {
            if (!upgradeTarget) return;
            const nextBindings = reconcileDataAppVizFieldMapping(
                upgradeTarget.schema.fields,
                effectiveItemsMap,
                selectedViz.fieldMapping,
            );
            upgradeDataAppVizVersion(
                upgradeTarget.version,
                nextBindings,
                pruneDataAppVizOptionValues(
                    upgradeTarget.schema.configOptions,
                    selectedViz.optionValues,
                ),
                pruneDataAppVizFieldOptionValues(
                    upgradeTarget.schema.fields,
                    nextBindings,
                    selectedViz.fieldOptionValues,
                ),
            );
            setPivotDimensions(
                deriveDataAppVizPivotConfig(
                    upgradeTarget.schema.fields,
                    nextBindings,
                )?.columns,
            );
        };

        const renderFieldOptions = (
            field: DataAppVizField,
            fieldIds: string[],
            group: string | null,
        ) => (
            <DataAppVizFieldOptions
                key={`${selectedViz.dataAppVizUuid}:${optionContractKey}`}
                field={field}
                group={group}
                fieldIds={fieldIds}
                getFieldLabel={(fieldId) => {
                    const item = effectiveItemsMap[fieldId];
                    return item ? getItemLabelWithoutTableName(item) : fieldId;
                }}
                values={selectedViz.fieldOptionValues[field.name] ?? {}}
                colorPalette={resolvedColorPalette}
                onChange={(fieldId, optionName, value) =>
                    setFieldOption(
                        selectedViz.dataAppVizUuid,
                        field.name,
                        fieldId,
                        optionName,
                        value,
                    )
                }
            />
        );

        const settings = (
            <Stack>
                {projectUuid &&
                    dataAppViz &&
                    isOfficialChartType(dataAppViz) && (
                        <DataAppVizLibraryUpgradeNotice
                            key={dataAppViz.dataAppVizUuid}
                            projectUuid={projectUuid}
                            dataAppViz={dataAppViz}
                        />
                    )}
                <DataAppVizSettings
                    itemsMap={effectiveItemsMap}
                    fields={fields}
                    fieldMapping={effectiveBindings}
                    onFieldChange={handleFieldChange}
                    renderFieldOptions={(field, fieldIds) =>
                        renderFieldOptions(field, fieldIds, null)
                    }
                />
                <DataAppVizInputGuidance
                    guidance={dataAppViz?.schema?.inputGuidance}
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
                                        projectUrlIdentifier ?? '',
                                        dataAppViz.slug,
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
                    resolvedColorPalette={resolvedColorPalette}
                    paletteControl={<ColorPaletteSection size="xs" />}
                    fields={fields}
                    fieldMapping={effectiveBindings}
                    renderFieldOptions={(group) =>
                        fields.map((field) => {
                            const fieldIds = getDataAppVizFieldIds(
                                effectiveBindings[field.name],
                            );
                            const hasOptions = (field.configOptions ?? []).some(
                                (option) => (option.group ?? null) === group,
                            );
                            return (
                                hasOptions &&
                                fieldIds.length > 0 && (
                                    <Stack key={field.name} gap="xs">
                                        <Text fz="xs" fw={600}>
                                            {field.label}
                                        </Text>
                                        {renderFieldOptions(
                                            field,
                                            fieldIds,
                                            group,
                                        )}
                                    </Stack>
                                )
                            );
                        })
                    }
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
                            canCreateApp && dataAppsEnabled
                                ? () =>
                                      void navigate({
                                          pathname: chartTypeBuilderPath(
                                              projectUrlIdentifier ?? '',
                                          ),
                                          search: location.search,
                                      })
                                : null
                        }
                        onBrowseGallery={() =>
                            void navigate(
                                `/projects/${projectUrlIdentifier}/chart-types`,
                            )
                        }
                    />
                )}

                {/* With nothing selected the tabs would only be an empty row. */}
                {selected !== null ? (
                    selectedTypeRemoved ? (
                        <Callout variant="warning" hideIcon p="xs">
                            <Text fz="xs">
                                This chart type has been removed. Pick another
                                chart type above.
                            </Text>
                        </Callout>
                    ) : (
                        selectedTypeTabs(selected)
                    )
                ) : isAuthoring ? (
                    <Text size="xs" c="dimmed">
                        Describe the chart type you need. Its bindings and
                        options appear here once the first version is ready.
                    </Text>
                ) : (
                    <Text size="xs" c="dimmed">
                        Pick a chart type above
                        {canCreateApp && dataAppsEnabled ? (
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
                                                projectUrlIdentifier ?? '',
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
