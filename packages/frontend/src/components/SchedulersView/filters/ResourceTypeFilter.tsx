import { Box, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import { BarChartIcon, DashboardIcon } from '../../common/ContentIcons';
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
                <Tooltip label="Show all schedulers">
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
                <Tooltip label="Show only chart schedulers" maw={200}>
                    <Box>
                        <MantineIcon icon={BarChartIcon} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'dashboard',
            label: (
                <Tooltip label="Show only dashboard schedulers" maw={200}>
                    <Box>
                        <MantineIcon icon={DashboardIcon} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
    ];

    return (
        <SegmentedControl
            size="xs"
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
