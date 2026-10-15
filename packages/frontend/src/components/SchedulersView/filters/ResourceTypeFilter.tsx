import { Box, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { IconChartBar, IconLayoutDashboard } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('scheduler');
    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };

    const data = [
        {
            value: 'all',
            label: (
                <Tooltip label={t('filters.resourceType.showAll')}>
                    <Box>
                        <Text fz="xs" fw={500}>
                            {t('filters.resourceType.all')}
                        </Text>
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'chart',
            label: (
                <Tooltip label={t('filters.resourceType.showCharts')} maw={200}>
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
                    label={t('filters.resourceType.showDashboards')}
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
