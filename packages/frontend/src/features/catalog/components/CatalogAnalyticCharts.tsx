import { type ApiCatalogAnalyticsResults } from '@lightdash/common';
import { Avatar, Group, Paper, Stack, Text } from '@mantine/core';
import { IconFolder, IconLayoutDashboard } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getChartIcon } from '../../../components/common/ResourceIcon';
import RouterNavLink from '../../../components/common/RouterNavLink';

type Props = {
    projectUuid: string;
    analyticResults: ApiCatalogAnalyticsResults;
};

export const CatalogAnalyticCharts: FC<React.PropsWithChildren<Props>> = ({
    projectUuid,
    analyticResults: { charts },
}) => {
    /**
     * Sort charts by space name, then by whether they are part of a dashboard, then by name
     */
    const sortedCharts = useMemo(
        () =>
            charts.sort((a, b) => {
                if (a.spaceName !== b.spaceName) {
                    return a.spaceName.localeCompare(b.spaceName);
                }

                if (!a.dashboardUuid && b.dashboardUuid) {
                    return -1;
                }
                if (a.dashboardUuid && !b.dashboardUuid) {
                    return 1;
                }

                return a.name.localeCompare(b.name);
            }),
        [charts],
    );

    if (charts.length === 0) {
        return <Text>No charts found</Text>;
    }

    return (
        <>
            {sortedCharts.length > 0 && (
                <Stack spacing="xs">
                    {sortedCharts.map((chart) => {
                        return (
                            <Paper
                                key={chart.uuid}
                                withBorder
                                w="100%"
                                p="xs"
                                radius="md"
                            >
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

                                        <Group spacing="two">
                                            <Group noWrap spacing="two">
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
                                            {chart.dashboardUuid && (
                                                <Group noWrap spacing="two">
                                                    <Text
                                                        color="gray.6"
                                                        mr="two"
                                                    >
                                                        {'/'}
                                                    </Text>
                                                    <MantineIcon
                                                        color="gray.6"
                                                        icon={
                                                            IconLayoutDashboard
                                                        }
                                                    />
                                                    <RouterNavLink
                                                        to={`/projects/${projectUuid}/dashboards/${chart.dashboardUuid}`}
                                                        label={
                                                            <Text fz="xs">
                                                                {
                                                                    chart.dashboardName
                                                                }
                                                            </Text>
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
                                            )}
                                        </Group>
                                    </Stack>
                                </Group>
                            </Paper>
                        );
                    })}
                </Stack>
            )}
        </>
    );
};
