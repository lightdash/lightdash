import { Group, Paper, Text, Tooltip } from '@mantine-8/core';
import { IconCalendar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { getGranularityLabel } from '../utils';
import { type DateZoomInfoOnTileProps } from './types';

export const DateZoomInfoOnTile: FC<DateZoomInfoOnTileProps> = ({
    dateZoomGranularity,
    dateDimension,
}) => {
    const availableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.availableCustomGranularities,
    );
    const label = getGranularityLabel(
        dateZoomGranularity,
        availableCustomGranularities,
    );

    return (
        <Tooltip
            label={
                <>
                    <Text fz="xs">
                        Date zoom:{' '}
                        <Text span fw={500} fz="inherit">
                            {label}
                        </Text>
                    </Text>
                    <Text fz="xs">
                        On:{' '}
                        <Text span fw={500} fz="inherit">
                            {dateDimension?.label}
                        </Text>
                    </Text>
                </>
            }
            disabled={!dateDimension}
            multiline
            withinPortal
        >
            <Paper radius="sm" py="xxs" px="xs" shadow="0">
                <Group wrap="nowrap" gap="xxs">
                    <MantineIcon icon={IconCalendar} size="sm" />
                    <Text fz={11}>{label}</Text>
                </Group>
            </Paper>
        </Tooltip>
    );
};
