import { Group, Paper, Text, Tooltip } from '@mantine-8/core';
import { IconCalendar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { type DateZoomInfoOnTileProps } from './types';

export const DateZoomInfoOnTileV2: FC<DateZoomInfoOnTileProps> = ({
    dateZoomGranularity,
    dateDimension,
}) => {
    return (
        <Tooltip
            label={
                <>
                    <Text fz="xs">
                        Date zoom:{' '}
                        <Text span fw={500} fz="inherit">
                            {dateZoomGranularity}
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
                    <Text fz={11}>{dateZoomGranularity}</Text>
                </Group>
            </Paper>
        </Tooltip>
    );
};
