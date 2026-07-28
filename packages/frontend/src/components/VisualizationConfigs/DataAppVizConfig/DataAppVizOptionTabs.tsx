import {
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
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
};

/**
 * Tab shell for a data app viz config form: a fixed `General` tab holding the
 * caller's content, then one tab per declared option `group` (ungrouped options
 * collapsing into `Display`). A viz that declares no options gets no tab strip
 * at all — the general content is the whole form.
 */
const DataAppVizOptionTabs: FC<Props> = ({
    generalContent,
    configOptions,
    values,
    onChange,
}) => {
    const optionGroups = useMemo(
        () => groupDataAppVizOptions(configOptions),
        [configOptions],
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
                    </Stack>
                </Tabs.Panel>
            ))}
        </Tabs>
    );
};

export default DataAppVizOptionTabs;
