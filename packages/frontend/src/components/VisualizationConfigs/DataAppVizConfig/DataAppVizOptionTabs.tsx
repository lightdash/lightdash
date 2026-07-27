import {
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type DataAppVizPaletteDeclaration,
} from '@lightdash/common';
import { Stack, Tabs } from '@mantine-8/core';
import { useMemo, type FC, type ReactNode } from 'react';
import { Config } from '../common/Config';
import DataAppVizOptionControl from './DataAppVizOptionControl';
import { groupDataAppVizOptions } from './dataAppVizOptionGroups';

type Props = {
    /** First tab's content — the caller's own viz picker / field mapping. */
    generalContent: ReactNode;
    configOptions: DataAppVizConfigOption[];
    /** Effective values: the stored value, or the declared default. */
    values: DataAppVizOptionValues;
    onChange: (name: string, value: DataAppVizOptionValue) => void;
    /** Null when the viz colours nothing from the resolved palette. */
    colorPalette: DataAppVizPaletteDeclaration | null;
    /**
     * Rendered in the tab the declaration names. Picking the chart's Lightdash
     * palette differs by surface (Explorer store vs local state), so the caller
     * owns the control; this component only places it.
     */
    paletteControl: ReactNode;
};

/**
 * Tab shell for a data app viz config form: a fixed `General` tab holding the
 * caller's content, then one tab per declared option `group` (ungrouped options
 * collapsing into `Display`), with the palette picker in the tab its
 * declaration names. A viz that declares neither options nor a palette gets no
 * tab strip at all — the general content is the whole form.
 */
const DataAppVizOptionTabs: FC<Props> = ({
    generalContent,
    configOptions,
    values,
    onChange,
    colorPalette,
    paletteControl,
}) => {
    const optionGroups = useMemo(
        () => groupDataAppVizOptions(configOptions, colorPalette),
        [configOptions, colorPalette],
    );

    if (optionGroups.length === 0) return <>{generalContent}</>;

    return (
        <Tabs defaultValue="general" keepMounted={false}>
            <Tabs.List mb="sm">
                <Tabs.Tab px="sm" value="general">
                    General
                </Tabs.Tab>
                {optionGroups.map((group) => (
                    <Tabs.Tab key={group.id} px="sm" value={group.id}>
                        {group.label}
                    </Tabs.Tab>
                ))}
            </Tabs.List>

            <Tabs.Panel value="general">{generalContent}</Tabs.Panel>

            {optionGroups.map((group) => (
                <Tabs.Panel key={group.id} value={group.id}>
                    <Stack>
                        {group.options.map((option) => (
                            <Config key={option.name}>
                                <Config.Section>
                                    <DataAppVizOptionControl
                                        option={option}
                                        value={values[option.name]}
                                        onChange={(value) =>
                                            onChange(option.name, value)
                                        }
                                    />
                                </Config.Section>
                            </Config>
                        ))}
                        {group.hasPalette && paletteControl}
                    </Stack>
                </Tabs.Panel>
            ))}
        </Tabs>
    );
};

export default DataAppVizOptionTabs;
