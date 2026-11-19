import { Group, Paper, Text, Tooltip } from '@mantine/core';
import { IconCalendarOff } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/** Shown on a live data source tile, which keeps its saved grain under date zoom. */
export const DateZoomNotAppliedOnTile: FC = () => (
    <Tooltip
        label="Date zoom isn't available on live data sources yet. This chart keeps its saved date grain."
        multiline
        maw={260}
    >
        <Paper radius="sm" py="xxs" px="xs" shadow="0">
            <Group wrap="nowrap" gap="xxs">
                <MantineIcon icon={IconCalendarOff} size="sm" color="dimmed" />
                <Text fz="xs" c="dimmed">
                    Not zoomed
                </Text>
            </Group>
        </Paper>
    </Tooltip>
);
