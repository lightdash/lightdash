import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Select,
    Stack,
    Tabs,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
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
const LATER_ROWS = ['Visibility', 'Required', 'Allowed values', 'Placement'];

const LaterBadge: FC = () => (
    <Tooltip label="Not in this version">
        <Badge size="xs" variant="light" color="gray" radius="sm">
            Later
        </Badge>
    </Tooltip>
);

export const ParameterSidebar: FC = () => {
    const { parameterKey, closeParameter } = useFilterSidebar();
    const [section, setSection] = useState<string | null>('interactivity');
    const getUiString = useUiStrings();
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const tileChartSavedParameters = useDashboardContext(
        (c) => c.tileChartSavedParameters,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);

    const sources = useMemo(
        () =>
            getParameterSources({
                parameterValues,
                tileParameterReferences,
                tileChartSavedParameters,
                parameterDefinitions,
            }),
        [
            parameterValues,
            tileParameterReferences,
            tileChartSavedParameters,
            parameterDefinitions,
        ],
    );

    if (parameterKey === null) return null;

    const key = parameterKey;
    const entries = sources[key] ?? [];
    const label = parameterDefinitions[key]?.label ?? key;
    const dashboardValue = parameterValues[key];
    const hasDashboardValue =
        dashboardValue !== undefined && dashboardValue !== null;
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
    const tabs = [
        ...dashboardTabs.map((tab) => ({ uuid: tab.uuid, name: tab.name })),
        { uuid: NO_TAB, name: '' },
    ];
    const usedTabCount = new Set(
        entries.map((entry) => getTile(entry.tileUuid)?.tabUuid ?? NO_TAB),
    ).size;
    const chartCount = `${entries.length} ${entries.length === 1 ? 'chart' : 'charts'}`;
    const tabReach =
        dashboardTabs.length > 1
            ? ` on ${usedTabCount} of ${dashboardTabs.length} tabs`
            : '';

    const renderChart = (entry: TileParameterSource) => (
        <Stack key={entry.tileUuid} gap={2}>
            <Group gap="xs" justify="space-between" wrap="nowrap">
                <Text fz="sm" truncate>
                    {getTileTitle(entry.tileUuid)}
                </Text>
                {entry.source === 'none' ? (
                    <Badge color="yellow.8">needs a value</Badge>
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
            <Tooltip label="Targeting is not in this version">
                <Select
                    size="xs"
                    disabled
                    data={['Follows the dashboard']}
                    value="Follows the dashboard"
                />
            </Tooltip>
        </Stack>
    );

    return (
        <Box className={classes.root}>
            <Group justify="space-between" wrap="nowrap" px="md" pt="md">
                <Stack gap={2} align="flex-start">
                    <Title order={5} className={classes.title}>
                        {label}
                    </Title>
                    <Text fz="xs" c="dimmed">
                        {`Parameter · ${chartCount} use it${tabReach}`}
                    </Text>
                </Stack>
                <Tooltip label="Close">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Close"
                        onClick={closeParameter}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Stack gap="md" p="md" className={classes.body}>
                <Tabs value={section} onChange={setSection}>
                    <Tabs.List mb="md">
                        <Tabs.Tab value="interactivity">Interactivity</Tabs.Tab>
                        <Tabs.Tab value="charts">Charts</Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="interactivity">
                        <Stack gap="md">
                            <Paper p="md">
                                <Stack gap="xs">
                                    <Text fz="sm" fw={600}>
                                        Value on this dashboard
                                    </Text>
                                    <Text fz="sm">
                                        {hasDashboardValue
                                            ? formatParameterValue(
                                                  dashboardValue,
                                              )
                                            : 'No dashboard value'}
                                    </Text>
                                    <Text fz="xs" c="dimmed">
                                        {hasDashboardValue
                                            ? `Charts that follow this control use ${formatParameterValue(dashboardValue)}, from the dashboard.`
                                            : 'No dashboard value. Each chart uses the parameter default, or the value saved on the chart.'}
                                    </Text>
                                    <Text fz="xs" c="dimmed">
                                        Change the value with the control on the
                                        bar.
                                    </Text>
                                </Stack>
                            </Paper>
                            <Paper p="md">
                                <Stack gap="sm">
                                    <Text fz="sm" fw={600}>
                                        Viewer controls
                                    </Text>
                                    {LATER_ROWS.map((row) => (
                                        <Group
                                            key={row}
                                            justify="space-between"
                                            wrap="nowrap"
                                            opacity={0.6}
                                        >
                                            <Stack gap={0}>
                                                <Text size="xs" fw={500}>
                                                    {row}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    Not in this version
                                                </Text>
                                            </Stack>
                                            <LaterBadge />
                                        </Group>
                                    ))}
                                </Stack>
                            </Paper>
                        </Stack>
                    </Tabs.Panel>
                    <Tabs.Panel value="charts">
                        <Stack gap="md">
                            <Stack gap="xs">
                                <Text fz="sm" fw={600}>
                                    Parameters in this control
                                </Text>
                                <Group justify="space-between" wrap="nowrap">
                                    <Text fz="sm" truncate>
                                        {key}
                                    </Text>
                                    <Text fz="xs" c="dimmed">
                                        {chartCount}
                                    </Text>
                                </Group>
                                <Tooltip label="Not in this version">
                                    <Button variant="light" size="xs" disabled>
                                        + Combine a parameter
                                    </Button>
                                </Tooltip>
                            </Stack>
                            {tabs.map((tab) => {
                                const inTab = entries.filter(
                                    (entry) =>
                                        (getTile(entry.tileUuid)?.tabUuid ??
                                            NO_TAB) === tab.uuid,
                                );
                                if (inTab.length === 0) return null;
                                return (
                                    <Stack key={tab.uuid} gap="xs">
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
                    </Tabs.Panel>
                </Tabs>
            </Stack>
            <Stack gap="xs" p="md" className={classes.footer}>
                <Button variant="default" onClick={closeParameter}>
                    Close
                </Button>
            </Stack>
        </Box>
    );
};
