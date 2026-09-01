import { Group, Paper, Text, Tooltip } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { getGranularityLabel } from '../utils';
import { type DateZoomInfoOnTileProps } from './types';

export const DateZoomInfoOnTile: FC<DateZoomInfoOnTileProps> = ({
    dateZoomGranularity,
    dateDimension,
}) => {
    const getUiString = useUiStrings();
    const availableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.availableCustomGranularities,
    );
    const label = getGranularityLabel(
        dateZoomGranularity,
        availableCustomGranularities,
        getUiString,
    );

    return (
        <Tooltip
            label={
                <>
                    <Text fz="xs">
                        {getUiString('dateZoom.dateZoomLabel')}{' '}
                        <Text span fw={500}>
                            {label}
                        </Text>
                    </Text>
                    <Text fz="xs">
                        {getUiString('dateZoom.onLabel')}{' '}
                        <Text span fw={500}>
                            {dateDimension?.label}
                        </Text>
                    </Text>
                </>
            }
            disabled={!dateDimension}
        >
            <Paper radius="sm" py="xxs" px="xs" shadow="0">
                <Group wrap="nowrap" gap="xxs">
                    <MantineIcon icon={IconCalendar} size="sm" />
                    <Text fz="xs">{label}</Text>
                </Group>
            </Paper>
        </Tooltip>
    );
};
