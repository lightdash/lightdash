/**
 * A live data source's main action, in its page header: fetch the fields the
 * integration offers now, with when that last happened beside it.
 */
import { Button, Group, Text, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    useLiveSourceFields,
    useRefreshLiveSourceFields,
} from '../hooks/useLiveSourceFields';

export const LiveSourceRefreshAction: FC<{
    projectUuid: string;
    connectionUuid: string;
}> = ({ projectUuid, connectionUuid }) => {
    const params = { projectUuid, connectionUuid };
    const { data: fields } = useLiveSourceFields(params);
    const refresh = useRefreshLiveSourceFields(params);
    const scannedAt = fields?.scannedAt;
    return (
        <Group gap="sm" wrap="nowrap">
            <Tooltip
                label={
                    scannedAt
                        ? dayjs(scannedAt).format('D MMM YYYY, HH:mm')
                        : 'Fields have not been fetched yet'
                }
                withinPortal
            >
                <Text fz="xs" c="dimmed" flex="none">
                    {scannedAt
                        ? `Fields refreshed ${dayjs(scannedAt).fromNow()}`
                        : 'Fields never refreshed'}
                </Text>
            </Tooltip>
            <Button
                size="xs"
                leftSection={<MantineIcon icon={IconRefresh} />}
                loading={refresh.isLoading}
                onClick={() => refresh.mutate()}
            >
                Refresh
            </Button>
        </Group>
    );
};
