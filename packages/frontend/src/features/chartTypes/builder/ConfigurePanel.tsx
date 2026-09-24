import {
    getDataAppVizFieldIds,
    getEffectiveOptionValues,
    type DataAppVizFieldOptionValues,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
    type DataAppVizContext,
} from '@lightdash/common';
import { Box, Divider, Stack, Tabs, Text } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import OverflowTabsList from '../../../components/common/OverflowTabsList/OverflowTabsList';
import { PalettePicker } from '../../../components/common/PalettePicker/PalettePicker';
import DataAppVizFieldOptions from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizFieldOptions';
import DataAppVizInputGuidance from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizInputGuidance';
import DataAppVizOptionControl from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizOptionControl';
import { groupDataAppVizOptions } from '../../../components/VisualizationConfigs/DataAppVizConfig/dataAppVizOptionGroups';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import ChartInputsList, {
    type ChartInputsBinding,
    type ChartTypePreviewDataSource,
} from './ChartInputsList';
import { ChartTypeSampleData } from './ChartTypeSampleData';
import classes from './ConfigurePanel.module.css';
import DataSourceSection from './DataSourceSection';
import { type ExploreSourceControls } from './exploreSource';
import PreviewRowsPeek from './PreviewRowsPeek';
import { type SavedChartSourceControls } from './savedChartSource';

const SAMPLE_SOURCE: ChartTypePreviewDataSource = { kind: 'sample' };

type Props = {
    schema: DataAppVizSchema;
    /** Only what the author explicitly changed; defaults resolve at render. */
    optionValues: DataAppVizOptionValues;
    onOptionChange: (name: string, value: DataAppVizOptionValue) => void;
    fieldOptionValues: DataAppVizFieldOptionValues;
    onFieldOptionChange: (
        fieldName: string,
        fieldId: string,
        optionName: string,
        value: DataAppVizOptionValue,
    ) => void;
    /** Preview-only; a chart using the viz owns the palette the normal way. */
    colorPaletteUuid: string | null;
    onPaletteChange: (colorPaletteUuid: string | null) => void;
    /** The same light/dark-aware palette rendered by the preview chart. */
    resolvedColorPalette: string[];
    /** The exact generated context rendered in the canvas preview. */
    previewContext: DataAppVizContext | null;
    /** The schema on screen belongs to a version being navigated away from;
     *  held legible but inert until the one being previewed arrives. */
    isStale: boolean;
    /** Where the previewed rows come from. Defaults to the fabricated sample. */
    previewDataSource?: ChartTypePreviewDataSource;
    /** The attached saved chart, when the host offers one. */
    savedChartSource?: SavedChartSourceControls | null;
    /** The explore source, when the host offers one; it takes over the data
     *  source tile while an explore is attached. */
    exploreSource?: ExploreSourceControls | null;
    /** Binds the declared slots to that chart's result columns. */
    inputsBinding?: ChartInputsBinding | null;
};

/**
 * The builder's configuration column: the options the current version declares,
 * with inputs in General and options in the same tabs the explorer uses. The
 * palette picker stays in the tab its declaration names. State lives in the page,
 * which derives the preview context from it.
 */
const ConfigurePanel: FC<Props> = ({
    schema,
    optionValues,
    onOptionChange,
    fieldOptionValues,
    onFieldOptionChange,
    colorPaletteUuid,
    onPaletteChange,
    resolvedColorPalette,
    previewContext,
    isStale,
    previewDataSource = SAMPLE_SOURCE,
    savedChartSource = null,
    exploreSource = null,
    inputsBinding = null,
}) => {
    const attachedExploreSource = exploreSource?.attached
        ? exploreSource
        : null;
    // With nothing bound the preview renders the sample, and so does the peek.
    const rowsSource =
        attachedExploreSource?.attached?.status === 'idle'
            ? savedChartSource
            : (attachedExploreSource ?? savedChartSource);
    // A table's query follows the inputs; a saved chart's query is fixed.
    const isAiPicked =
        inputsBinding !== null && Object.keys(inputsBinding.aiPicks).length > 0;
    const sourceHint =
        previewDataSource.kind === 'sample'
            ? null
            : exploreSource?.attached
              ? {
                    text: isAiPicked
                        ? `Picked from ${exploreSource.attached.label} for your prompt. Changing one re-runs the query.`
                        : `Fields from ${exploreSource.attached.label}. Changing one re-runs the query.`,
                    isAiPicked,
                }
              : savedChartSource?.attached
                ? {
                      text: `Fields from ${savedChartSource.attached.chartName}. Changing one re-runs the query.`,
                      isAiPicked: false,
                  }
                : null;
    const { data: palettes = [] } = useColorPalettes();

    const effectiveValues = useMemo(
        () => getEffectiveOptionValues(schema.configOptions, optionValues),
        [schema.configOptions, optionValues],
    );

    const optionGroups = useMemo(
        () =>
            groupDataAppVizOptions(
                schema.configOptions,
                schema.colorPalette,
                schema.fields,
                previewContext?.fieldMapping ?? {},
            ),
        [
            schema.configOptions,
            schema.colorPalette,
            schema.fields,
            previewContext?.fieldMapping,
        ],
    );

    // Only meaningful against real rows: the sample binds slot to slot.
    const boundLabels = useMemo(() => {
        if (previewDataSource.kind !== 'live' || !previewContext) return null;
        return Object.fromEntries(
            schema.fields.flatMap((field) => {
                const labels = getDataAppVizFieldIds(
                    previewContext.fieldMapping[field.name],
                ).map((id) => previewContext.fields[id]?.label ?? id);
                return labels.length > 0
                    ? [[field.name, labels.join(', ')] as const]
                    : [];
            }),
        );
    }, [schema.fields, previewContext, previewDataSource]);

    const renderFieldOptions = (group: string | null) =>
        previewContext &&
        schema.fields.map((field) => {
            const fieldIds = getDataAppVizFieldIds(
                previewContext.fieldMapping[field.name],
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
                        <DataAppVizFieldOptions
                            field={field}
                            group={group}
                            fieldIds={fieldIds}
                            getFieldLabel={(fieldId) =>
                                previewContext.fields[fieldId]?.label ?? fieldId
                            }
                            values={fieldOptionValues[field.name] ?? {}}
                            colorPalette={resolvedColorPalette}
                            onChange={(fieldId, optionName, value) =>
                                onFieldOptionChange(
                                    field.name,
                                    fieldId,
                                    optionName,
                                    value,
                                )
                            }
                        />
                    </Stack>
                )
            );
        });

    const [selectedTab, setSelectedTab] = useState<string | null>('general');
    // A tab a rebuild stopped declaring must not leave the panel blank.
    const activeTab =
        selectedTab === 'general' ||
        optionGroups.some((group) => group.id === selectedTab)
            ? selectedTab
            : 'general';

    return (
        <Box className={classes.panel} data-stale={isStale} inert={isStale}>
            {savedChartSource || exploreSource ? (
                <>
                    <Box p="sm" pb={0}>
                        <DataSourceSection
                            savedChartSource={savedChartSource}
                            exploreSource={exploreSource}
                        />
                    </Box>
                    <Divider
                        className={classes.generatedDivider}
                        labelPosition="center"
                        label={
                            <Text className={classes.generatedChip}>
                                Generated options
                            </Text>
                        }
                    />
                </>
            ) : (
                <Text className={classes.generatedChip}>Generated options</Text>
            )}
            <Tabs
                value={activeTab}
                onChange={setSelectedTab}
                keepMounted={false}
                className={classes.tabs}
            >
                <OverflowTabsList className={classes.tabsList}>
                    <Tabs.Tab value="general" px="xs">
                        General
                    </Tabs.Tab>
                    {optionGroups.map((group) => (
                        <Tabs.Tab key={group.id} value={group.id} px="xs">
                            {group.label}
                        </Tabs.Tab>
                    ))}
                </OverflowTabsList>

                <Tabs.Panel value="general" className={classes.tabPanel}>
                    <Stack gap="sm" p="sm">
                        <ChartInputsList
                            fields={schema.fields}
                            boundLabels={inputsBinding ? null : boundLabels}
                            binding={inputsBinding}
                            sourceHint={sourceHint}
                        />
                        {renderFieldOptions(null)}
                        <DataAppVizInputGuidance
                            guidance={schema.inputGuidance}
                        />
                        {rowsSource ? (
                            <PreviewRowsPeek
                                source={rowsSource}
                                fields={schema.fields}
                                context={previewContext}
                            />
                        ) : (
                            <ChartTypeSampleData
                                context={previewContext}
                                dataSource={previewDataSource}
                            />
                        )}
                        {optionGroups.length === 0 && (
                            <Text fz="xs" c="dimmed">
                                This chart type declares no display options.
                            </Text>
                        )}
                    </Stack>
                </Tabs.Panel>

                {optionGroups.map((group) => (
                    <Tabs.Panel
                        key={group.id}
                        value={group.id}
                        className={classes.tabPanel}
                    >
                        <Stack gap="sm" p="sm">
                            {group.options.map((option) => (
                                <DataAppVizOptionControl
                                    key={option.name}
                                    option={option}
                                    value={effectiveValues[option.name]}
                                    colorPalette={resolvedColorPalette}
                                    onChange={(value) =>
                                        onOptionChange(option.name, value)
                                    }
                                />
                            ))}
                            {group.hasFieldOptions &&
                                renderFieldOptions(group.label)}
                            {group.hasPalette && (
                                <PalettePicker
                                    label="Color palette"
                                    value={colorPaletteUuid}
                                    onChange={onPaletteChange}
                                    palettes={palettes}
                                    parentLabel="Project default"
                                    showPreview={false}
                                />
                            )}
                        </Stack>
                    </Tabs.Panel>
                ))}
            </Tabs>
        </Box>
    );
};

export default ConfigurePanel;
