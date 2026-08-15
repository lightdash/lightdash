import {
    getEffectiveOptionValues,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
} from '@lightdash/common';
import { Box, Stack, Tabs, Text } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import OverflowTabsList from '../../../components/common/OverflowTabsList/OverflowTabsList';
import { PalettePicker } from '../../../components/common/PalettePicker/PalettePicker';
import DataAppVizOptionControl from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizOptionControl';
import { groupDataAppVizOptions } from '../../../components/VisualizationConfigs/DataAppVizConfig/dataAppVizOptionGroups';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import classes from './ConfigurePanel.module.css';

type Props = {
    schema: DataAppVizSchema;
    /** Only what the author explicitly changed; defaults resolve at render. */
    optionValues: DataAppVizOptionValues;
    onOptionChange: (name: string, value: DataAppVizOptionValue) => void;
    /** Preview-only; a chart using the viz owns the palette the normal way. */
    colorPaletteUuid: string | null;
    onPaletteChange: (colorPaletteUuid: string | null) => void;
    /** The schema on screen belongs to a version being navigated away from;
     *  held legible but inert until the one being previewed arrives. */
    isStale: boolean;
};

/**
 * The builder's configuration column: the options the current version declares,
 * split into the same tabs the explorer uses, with the palette picker in the
 * tab its declaration names. The option and palette state lives in the page,
 * which derives the preview context from it.
 */
const ConfigurePanel: FC<Props> = ({
    schema,
    optionValues,
    onOptionChange,
    colorPaletteUuid,
    onPaletteChange,
    isStale,
}) => {
    const { data: palettes = [] } = useColorPalettes();

    const effectiveValues = useMemo(
        () => getEffectiveOptionValues(schema.configOptions, optionValues),
        [schema.configOptions, optionValues],
    );

    const optionGroups = useMemo(
        () => groupDataAppVizOptions(schema.configOptions, schema.colorPalette),
        [schema.configOptions, schema.colorPalette],
    );

    const [selectedTab, setSelectedTab] = useState<string | null>(
        optionGroups[0]?.id ?? null,
    );
    // A tab a rebuild stopped declaring must not leave the panel blank.
    const activeTab = optionGroups.some((group) => group.id === selectedTab)
        ? selectedTab
        : (optionGroups[0]?.id ?? null);

    return (
        <Box className={classes.panel} data-stale={isStale} inert={isStale}>
            {/* The options are the generated contract, not Lightdash chart
                config, and the chip says so. */}
            <Text className={classes.generatedChip}>Generated options</Text>

            {optionGroups.length === 0 ? (
                <Text fz="xs" c="dimmed" lh={1.5} px="sm" pb="sm">
                    This chart type declares no display options.
                </Text>
            ) : (
                <Tabs
                    value={activeTab}
                    onChange={setSelectedTab}
                    keepMounted={false}
                    className={classes.tabs}
                >
                    <OverflowTabsList className={classes.tabsList}>
                        {optionGroups.map((group) => (
                            <Tabs.Tab key={group.id} value={group.id} px="xs">
                                {group.label}
                            </Tabs.Tab>
                        ))}
                    </OverflowTabsList>

                    {optionGroups.map((group) => (
                        <Tabs.Panel
                            key={group.id}
                            value={group.id}
                            className={classes.tabPanel}
                        >
                            <Stack gap="sm" px="sm" pt="sm" pb="sm">
                                {group.options.map((option) => (
                                    <DataAppVizOptionControl
                                        key={option.name}
                                        option={option}
                                        value={effectiveValues[option.name]}
                                        onChange={(value) =>
                                            onOptionChange(option.name, value)
                                        }
                                    />
                                ))}
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
            )}
        </Box>
    );
};

export default ConfigurePanel;
