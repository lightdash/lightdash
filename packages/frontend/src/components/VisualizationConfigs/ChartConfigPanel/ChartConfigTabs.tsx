import { MantineProvider, Tabs } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { getMantineThemeOverride } from '../../../mantineTheme';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import AxesOptions from './Axes/AxesOptions';
import FieldLayoutOptions from './FieldLayoutOptions';
import GridPanel from './Grid';
import LegendPanel from './Legend';
import SeriesTab from './Series';

const themeOverride = getMantineThemeOverride({
    components: {
        Select: {
            styles: (theme) => ({
                label: {
                    fontSize: theme.fontSizes.xs,
                    fontWeight: 500,
                    color: theme.colors.gray['6'],
                },
            }),
            defaultProps: {
                size: 'xs',
            },
        },
        Label: {
            defaultProps: {
                color: 'red',
            },
        },
        TextInput: {
            defaultProps: {
                size: 'xs',
            },
        },
        Switch: {
            styles: (theme) => ({
                label: {
                    fontSize: theme.fontSizes.xs,
                    fontWeight: 500,
                    color: theme.colors.gray['6'],
                    paddingLeft: 4,
                },
            }),
            defaultProps: {
                size: 'xs',
            },
        },
        SegmentedControl: {
            defaultProps: {
                size: 'xs',
            },
        },
        Button: {
            defaultProps: {
                size: 'xs',
            },
        },
        CloseButton: {
            defaultProps: {
                size: 'xs',
            },
        },
        NumberInput: {
            defaultProps: {
                size: 'xs',
            },
        },
        Checkbox: {
            styles: (theme) => ({
                label: {
                    fontSize: theme.fontSizes.xs,
                    fontWeight: 500,
                    color: theme.colors.gray['6'],
                    paddingLeft: 4,
                },
            }),
            defaultProps: {
                size: 'xs',
            },
        },
        ActionIcon: {
            defaultProps: {
                size: 'sm',
            },
        },
    },
});

const ChartConfigTabs: FC = memo(() => {
    const { itemsMap } = useVisualizationContext();

    const items = useMemo(() => Object.values(itemsMap || {}), [itemsMap]);

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="layout" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="layout">
                        Layout
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="series">
                        Series
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="axes">
                        Axes
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="legend">
                        Display
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="grid">
                        Margins
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="layout">
                    <FieldLayoutOptions items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="series">
                    <SeriesTab items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="axes">
                    <AxesOptions itemsMap={itemsMap} />
                </Tabs.Panel>
                <Tabs.Panel value="legend">
                    <LegendPanel items={items} />
                </Tabs.Panel>
                <Tabs.Panel value="grid">
                    <GridPanel />
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});

export default ChartConfigTabs;
