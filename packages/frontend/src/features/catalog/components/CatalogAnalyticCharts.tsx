import { type ApiCatalogAnalyticsResults } from '@lightdash/common';
import { Anchor, Flex, Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';

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
                    <Text weight={700}>
                        Used in {chartsInSpace.length} charts in spaces
                    </Text>
                    {chartsInSpace.map((chart) => {
                        return (
                            <Flex key={chart.uuid}>
                                <Anchor
                                    href={`/projects/${projectUuid}/spaces/${chart.spaceUuid}`}
                                >
                                    {chart.spaceName}
                                </Anchor>
                                /
                                <Anchor
                                    href={`/projects/${projectUuid}/saved/${chart.uuid}`}
                                >
                                    {chart.name}
                                </Anchor>
                            </Flex>
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
