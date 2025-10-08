import { Box, SegmentedControl, Text, Tooltip } from '@mantine-8/core';
import { IconChartBar, IconLayoutDashboard } from '@tabler/icons-react';
import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import MantineIcon from '../../common/MantineIcon';
import classes from './ResourceTypeFilter.module.css';

type ResourceTypeFilterProps = Pick<
    ReturnType<typeof useSchedulerFilters>,
    'selectedResourceType' | 'setSelectedResourceType'
>;

export const ResourceTypeFilter = ({
    selectedResourceType,
    setSelectedResourceType,
}: ResourceTypeFilterProps) => {
    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };

    const data = [
        {
            value: 'all',
            label: (
                <Tooltip label="Show all schedulers" withinPortal>
                    <Box>
                        <Text fz="xs" fw={500}>
                            All
                        </Text>
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'chart',
            label: (
                <Tooltip
                    variant="xs"
                    label="Show only chart schedulers"
                    withinPortal
                    maw={200}
                >
                    <Box>
                        <MantineIcon icon={IconChartBar} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'dashboard',
            label: (
                <Tooltip
                    variant="xs"
                    label="Show only dashboard schedulers"
                    withinPortal
                    maw={200}
                >
                    <Box>
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            {...iconProps}
                        />
                    </Box>
                </Tooltip>
            ),
        },
    ];

    return (
        <SegmentedControl
            size="xs"
            radius="md"
            value={selectedResourceType}
            onChange={(value) =>
                setSelectedResourceType(value as 'all' | 'chart' | 'dashboard')
            }
            classNames={{
                root: classes.segmentedControl,
                indicator: classes.indicator,
                label: classes.label,
            }}
            data={data}
        />
    );
};
