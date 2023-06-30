import { SavedChart } from '@lightdash/common';
import { ActionIcon, Anchor, List, Popover, Space, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { FC } from 'react';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import MantineIcon from '../../common/MantineIcon';

type Props = { savedChart: SavedChart; projectUuid: string };

export const SavedChartInfoTooltip: FC<Props> = ({
    savedChart,
    projectUuid,
}) => {
    const { data: relatedDashboards } = useDashboardsContainingChart(
        projectUuid,
        savedChart.uuid,
    );

    return (
        <Popover
            offset={-2}
            width={200}
            position="bottom"
            withArrow
            shadow="md"
            withinPortal
        >
            <Popover.Target>
                <ActionIcon>
                    <MantineIcon icon={IconInfoCircle} color="gray.6" />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                <div>
                    {savedChart.description && (
                        <>
                            <Text fz="xs" fw={600} color="gray.6">
                                Description:{' '}
                            </Text>
                            <Text fz="xs">{savedChart.description}</Text>
                        </>
                    )}
                    <>
                        {savedChart.description && <Space h={8} />}
                        <Text fw={600} fz="xs" color="gray.6">
                            Used in {relatedDashboards?.length ?? 0} dashboard
                            {relatedDashboards?.length === 1 ? '' : 's'}
                        </Text>
                        {!!relatedDashboards?.length && (
                            <List size="xs">
                                {relatedDashboards.map(({ uuid, name }) => (
                                    <List.Item key={uuid}>
                                        <Anchor
                                            href={`/projects/${projectUuid}/dashboards/${uuid}/view`}
                                        >
                                            {name}
                                        </Anchor>
                                    </List.Item>
                                ))}
                            </List>
                        )}
                    </>
                </div>
            </Popover.Dropdown>
        </Popover>
    );
};
