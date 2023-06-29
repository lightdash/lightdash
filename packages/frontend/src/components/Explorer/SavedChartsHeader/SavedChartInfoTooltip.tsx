import { SavedChart } from '@lightdash/common';
import { Anchor, List, Space, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { FC } from 'react';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import { useTooltipControlOpen } from '../../../hooks/tooltip/useTooltipControlOpen';
import MantineIcon from '../../common/MantineIcon';

type Props = { savedChart: SavedChart; projectUuid: string };

export const SavedChartInfoTooltip: FC<Props> = ({
    savedChart,
    projectUuid,
}) => {
    const {
        tooltipProps: { sx, isOpen, handleMouseEnter, handleMouseLeave },
        tooltipLabelProps: { handleLabelMouseEnter, handleLabelMouseLeave },
    } = useTooltipControlOpen();
    const { data: relatedDashboards } = useDashboardsContainingChart(
        projectUuid,
        savedChart.uuid,
    );

    return (
        <Tooltip
            sx={sx}
            opened={isOpen}
            p="sm"
            maw={250}
            position="bottom"
            multiline
            withinPortal
            label={
                <div
                    onMouseEnter={handleLabelMouseEnter}
                    onMouseLeave={handleLabelMouseLeave}
                >
                    {savedChart.description && (
                        <>
                            <Text fz="xs" fw={600} color="gray.6">
                                Description:{' '}
                            </Text>
                            <Text fz="xs">{savedChart.description}</Text>
                        </>
                    )}
                    <>
                        {savedChart.description && <Space h={4} />}
                        <Text fw={600} fz="xs" color="gray.6">
                            Used in {relatedDashboards?.length ?? 0} dashboard
                            {relatedDashboards?.length === 1 ? '' : 's'}
                        </Text>
                        {!!relatedDashboards?.length && (
                            <List
                                size="xs"
                                styles={{
                                    item: {
                                        '::marker': {
                                            color: 'white',
                                        },
                                    },
                                }}
                            >
                                {relatedDashboards.map(({ uuid, name }) => (
                                    <List.Item key={uuid}>
                                        <Anchor
                                            color="white"
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
            }
        >
            <MantineIcon
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                icon={IconInfoCircle}
                color="gray.6"
            />
        </Tooltip>
    );
};
