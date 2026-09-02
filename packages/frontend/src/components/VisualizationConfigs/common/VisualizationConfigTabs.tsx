import { Tabs } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import ConfigTabsList from '../../common/ChartGallery/ConfigTabsList';

type VisualizationConfigTab = {
    value: string;
    label: string;
    panel: ReactNode;
};

type Props = {
    tabs: VisualizationConfigTab[];
    defaultValue?: string;
};

export const VisualizationConfigTabs: FC<Props> = ({ tabs, defaultValue }) => (
    <Tabs defaultValue={defaultValue ?? tabs[0]?.value} keepMounted={false}>
        <ConfigTabsList mb="sm">
            {tabs.map(({ value, label }) => (
                <Tabs.Tab key={value} px="sm" value={value}>
                    {label}
                </Tabs.Tab>
            ))}
        </ConfigTabsList>

        {tabs.map(({ value, panel }) => (
            <Tabs.Panel key={value} value={value}>
                {panel}
            </Tabs.Panel>
        ))}
    </Tabs>
);
