import { Badge, Box, Button, Group, Stack, Text, Title } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import classes from './FilterSidebar.module.css';
import {
    formatParameterValue,
    getParameterSources,
    type TileParameterSource,
} from './parameterSources';
import { useFilterSidebar } from './useFilterSidebar';

const NO_TAB = 'no-tab';

export const ParameterSidebar: FC = () => {
    const { isParametersOpen, closeParameters } = useFilterSidebar();
    const getUiString = useUiStrings();
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);

    const sources = useMemo(
        () =>
            getParameterSources({
                parameterValues,
                tileParameterReferences,
                parameterDefinitions,
            }),
        [parameterValues, tileParameterReferences, parameterDefinitions],
    );

    if (!isParametersOpen) return null;

    const tabs = [
        ...dashboardTabs.map((tab) => ({ uuid: tab.uuid, name: tab.name })),
        { uuid: NO_TAB, name: '' },
    ];
    const getTile = (tileUuid: string) =>
        dashboardTiles?.find((tile) => tile.uuid === tileUuid);
    const getTileTitle = (tileUuid: string) => {
        const properties = getTile(tileUuid)?.properties;
        if (!properties) return 'Chart';
        const title = 'title' in properties ? properties.title : undefined;
        const chartName =
            'chartName' in properties ? properties.chartName : undefined;
        return title || chartName || 'Chart';
    };
    const renderChart = (entry: TileParameterSource) => (
        <Group
            key={entry.tileUuid}
            gap="xs"
            justify="space-between"
            wrap="nowrap"
        >
            <Text fz="sm" truncate>
                {getTileTitle(entry.tileUuid)}
            </Text>
            {entry.source === 'chart' ? (
                <Badge>chart value</Badge>
            ) : (
                <Group gap="xxs" wrap="nowrap">
                    <Text fz="sm" fw={500}>
                        {formatParameterValue(entry.value)}
                    </Text>
                    <Badge>
                        {getUiString(`parameters.source.${entry.source}`)}
                    </Badge>
                </Group>
            )}
        </Group>
    );

    return (
        <Box className={classes.root}>
            <Group justify="space-between" p="md" wrap="nowrap">
                <Title order={5} className={classes.title}>
                    Parameter values
                </Title>
            </Group>
            <Stack gap="lg" p="md" className={classes.body}>
                {Object.entries(sources).map(([key, entries]) => {
                    const dashboardValue = parameterValues[key];
                    const hasDashboardValue =
                        dashboardValue !== undefined && dashboardValue !== null;
                    return (
                        <Stack key={key} gap="xs">
                            <Text fw={600}>
                                {parameterDefinitions[key]?.label ?? key}
                            </Text>
                            <Text fz="sm">
                                {hasDashboardValue
                                    ? formatParameterValue(dashboardValue)
                                    : 'No dashboard value'}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {hasDashboardValue
                                    ? `Charts that follow this control use ${formatParameterValue(dashboardValue)}, from the dashboard.`
                                    : 'No dashboard value. Each chart uses the parameter default, or the value saved on the chart.'}
                            </Text>
                            {tabs.map((tab) => {
                                const inTab = entries.filter(
                                    (entry) =>
                                        (getTile(entry.tileUuid)?.tabUuid ??
                                            NO_TAB) === tab.uuid,
                                );
                                if (inTab.length === 0) return null;
                                return (
                                    <Stack key={tab.uuid} gap="xxs">
                                        {tab.name !== '' && (
                                            <Text fz="xs" c="dimmed" fw={500}>
                                                {tab.name}
                                            </Text>
                                        )}
                                        {inTab.map(renderChart)}
                                    </Stack>
                                );
                            })}
                        </Stack>
                    );
                })}
                <Text fz="xs" c="dimmed">
                    Read only for now. Change values with the parameter controls
                    on the bar.
                </Text>
            </Stack>
            <Stack gap="xs" p="md" className={classes.footer}>
                <Button variant="default" onClick={closeParameters}>
                    Close
                </Button>
            </Stack>
        </Box>
    );
};
