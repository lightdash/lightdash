import { type ApiCatalogAnalyticsResults } from '@lightdash/common';
import { Anchor, Avatar, Flex, Group, Paper, Stack, Text } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    ChartIcon,
    getChartIcon,
} from '../../../components/common/ResourceIcon';
import RouterNavLink from '../../../components/common/RouterNavLink';

type Props = {
    projectUuid: string;
    analyticResults: ApiCatalogAnalyticsResults;
};

export const CatalogAnalyticCharts: FC<React.PropsWithChildren<Props>> = ({
    projectUuid,
    analyticResults: { charts },
}) => {
    const [chartsInSpace, chartsWithinDashboard] = useMemo(() => {
        return [
            charts
                .filter((chart) => !chart.dashboardUuid)
                .sort((a, b) => a.spaceName.localeCompare(b.spaceName)),
            charts
                .filter((chart) => chart.dashboardUuid)
                .sort((a, b) =>
                    a.dashboardName && b.dashboardName
                        ? a.dashboardName.localeCompare(b.dashboardName)
                        : 0,
                ),
        ];
    }, [charts]);

    if (charts.length === 0) {
        return <Text>No charts found</Text>;
    }

    return (
        <Stack>
            {chartsInSpace.length > 0 && (
                <Stack>
                    {chartsInSpace.map((chart) => {
                        return (
                            <Paper key={chart.uuid} withBorder w="100%" p="xs">
                                <Group noWrap>
                                    <Avatar size="sm" color="blue" radius="xl">
                                        <MantineIcon
                                            icon={getChartIcon(chart.chartKind)}
                                        />
                                    </Avatar>
                                    <Stack spacing="two">
                                        <RouterNavLink
                                            to={`/projects/${projectUuid}/saved/${chart.uuid}`}
                                            label={
                                                <Text fz="sm" fw={500}>
                                                    {chart.name}
                                                </Text>
                                            }
                                            sx={{
                                                '&:hover': {
                                                    backgroundColor:
                                                        'transparent',
                                                },
                                            }}
                                            p={0}
                                        />

                                        <Group spacing="two" noWrap>
                                            <MantineIcon
                                                color="gray.6"
                                                icon={IconFolder}
                                            />
                                            <RouterNavLink
                                                to={`/projects/${projectUuid}/spaces/${chart.spaceUuid}`}
                                                label={
                                                    <Text fz="xs">
                                                        {chart.spaceName}
                                                    </Text>
                                                    // TODO add for charts that belong to dashboard
                                                }
                                                p={0}
                                                c="gray.6"
                                                sx={{
                                                    '&:hover': {
                                                        backgroundColor:
                                                            'transparent',
                                                    },
                                                }}
                                            />
                                        </Group>
                                    </Stack>
                                </Group>
                            </Paper>
                        );
                    })}
                </Stack>
            )}
            {chartsWithinDashboard.length > 0 && (
                <Stack>
                    <Text weight={700}>
                        Used in {chartsWithinDashboard.length} charts in spaces
                    </Text>
                    {chartsWithinDashboard.map((chart) => {
                        return (
                            <Flex key={chart.uuid}>
                                <ChartIcon chartKind={chart.chartKind} />
                                <Anchor
                                    target="_blank"
                                    href={`/projects/${projectUuid}/dashboards/${chart.dashboardUuid}`}
                                >
                                    {chart.dashboardName}
                                </Anchor>
                                /
                                <Anchor
                                    target="_blank"
                                    href={`/projects/${projectUuid}/saved/${chart.uuid}`}
                                >
                                    {chart.name}
                                </Anchor>
                            </Flex>
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
};
