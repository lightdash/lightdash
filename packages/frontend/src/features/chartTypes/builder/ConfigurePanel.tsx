import {
    getEffectiveOptionValues,
    type DataAppVizField,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
} from '@lightdash/common';
import { Box, Group, Stack, Tabs, Text } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import OverflowTabsList from '../../../components/common/OverflowTabsList/OverflowTabsList';
import { PalettePicker } from '../../../components/common/PalettePicker/PalettePicker';
import TruncatedText from '../../../components/common/TruncatedText';
import DataAppVizOptionControl from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizOptionControl';
import { groupDataAppVizOptions } from '../../../components/VisualizationConfigs/DataAppVizConfig/dataAppVizOptionGroups';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import DataAppVizFieldTypeBadge from '../components/DataAppVizFieldTypeBadge';
import { poolKeyForSlot } from '../utils/autoMapDataAppVizFields';
import classes from './ConfigurePanel.module.css';

const FIELDS_TAB_ID = 'fields';

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

const AcceptedFields: FC<{ fields: DataAppVizField[] }> = ({ fields }) => (
    <Stack gap="xs" className={classes.acceptedFields}>
        <Text fz="xs" fw={600}>
            Accepted fields
        </Text>

        {fields.length === 0 ? (
            <Text fz="xs" c="dimmed" lh={1.5}>
                This chart type accepts no data fields.
            </Text>
        ) : (
            <Stack gap={0}>
                {fields.map((field) => (
                    <Group
                        key={field.name}
                        justify="space-between"
                        gap="xs"
                        wrap="nowrap"
                        className={classes.fieldRow}
                    >
                        <Stack gap={1} className={classes.fieldDetails}>
                            <TruncatedText maxWidth="100%" fw={500} fz="xs">
                                {field.label}
                            </TruncatedText>
                            <Text fz="xs" c="dimmed">
                                {field.required ? 'Required' : 'Optional'}
                            </Text>
                        </Stack>
                        <DataAppVizFieldTypeBadge
                            type={poolKeyForSlot(field)}
                        />
                    </Group>
                ))}
            </Stack>
        )}
    </Stack>
);

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
        optionGroups[0]?.id ?? FIELDS_TAB_ID,
    );
    // A tab a rebuild stopped declaring must not leave the panel blank.
    const activeTab =
        selectedTab === FIELDS_TAB_ID ||
        optionGroups.some((group) => group.id === selectedTab)
            ? selectedTab
            : (optionGroups[0]?.id ?? FIELDS_TAB_ID);

    return (
        <Box className={classes.panel} data-stale={isStale} inert={isStale}>
            {/* The options are the generated contract, not Lightdash chart
                config, and the chip says so. */}
            <Text className={classes.generatedChip}>Generated options</Text>

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
                    <Tabs.Tab value={FIELDS_TAB_ID} px="xs">
                        Fields
                    </Tabs.Tab>
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

                <Tabs.Panel value={FIELDS_TAB_ID} className={classes.tabPanel}>
                    <AcceptedFields fields={schema.fields} />
                </Tabs.Panel>
            </Tabs>
        </Box>
    );
};

export default ConfigurePanel;
