import {
    SchedulerFormat,
    getHumanReadableCronExpression,
    type Scheduler,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconPencil, IconSend, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { GSheetsIcon } from '../../../components/common/GSheetsIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import { useChartSchedulers } from '../../../features/scheduler/hooks/useChartSchedulers';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useSendNowScheduler } from '../../scheduler/hooks/useScheduler';
import { useSchedulersEnabledUpdateMutation } from '../../scheduler/hooks/useSchedulersUpdateMutation';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { GoogleSheetsInfoPopover } from './GoogleSheetsInfoPopover';

const ToggleSyncEnabled: FC<{ scheduler: Scheduler }> = ({ scheduler }) => {
    const { mutate: mutateSchedulerEnabled } =
        useSchedulersEnabledUpdateMutation(scheduler.schedulerUuid);

    const [schedulerEnabled, setSchedulerEnabled] = useState<boolean>(
        scheduler.enabled,
    ); // To avoid delay on toggle

    return (
        <Tooltip
            withinPortal
            variant="xs"
            maw={130}
            label={
                scheduler.enabled
                    ? 'Toggle off to temporarily pause notifications'
                    : 'Notifications paused. Toggle on to resume'
            }
        >
            <Box mr="sm">
                <Switch
                    checked={schedulerEnabled}
                    onChange={() => {
                        mutateSchedulerEnabled(!schedulerEnabled);
                        setSchedulerEnabled(!schedulerEnabled);
                    }}
                />
            </Box>
        </Tooltip>
    );
};

type Props = { chartUuid: string } & Pick<MantineModalProps, 'onClose'>;

export const SyncModalView: FC<Props> = ({ chartUuid, onClose }) => {
    const { data } = useChartSchedulers(chartUuid);
    const { setAction, setCurrentSchedulerUuid } = useSyncModal();
    const googleSheetsSyncs = data?.filter(
        ({ format }) => format === SchedulerFormat.GSHEETS,
    );

    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);

    const { mutate: mutateSendNow, isLoading: isSendingNowLoading } =
        useSendNowScheduler();
    const { track } = useTracking();

    if (!project) return null;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Sync with Google Sheets"
            icon={GSheetsIcon}
            size="xl"
            leftActions={<GoogleSheetsInfoPopover />}
            actions={
                <Button onClick={() => setAction(SyncModalAction.CREATE)}>
                    Create
                </Button>
            }
            modalBodyProps={{
                bg: 'background',
                mah: 500,
                mih: 300,
            }}
        >
            {googleSheetsSyncs && googleSheetsSyncs.length ? (
                <Stack>
                    {googleSheetsSyncs.map((sync) => (
                        <Paper
                            key={sync.schedulerUuid}
                            p="sm"
                            withBorder
                            style={{
                                overflow: 'hidden',
                            }}
                        >
                            <Group wrap="nowrap" justify="space-between">
                                <Stack gap="xs">
                                    <Text fz="sm" fw={600} truncate>
                                        {sync.name}
                                    </Text>

                                    <Text size="xs" c="ldGray.6">
                                        {getHumanReadableCronExpression(
                                            sync.cron,
                                            sync.timezone ||
                                                project.schedulerTimezone,
                                        )}
                                    </Text>
                                </Stack>

                                <Group wrap="nowrap" gap="xs">
                                    <ToggleSyncEnabled scheduler={sync} />

                                    <Tooltip withinPortal label="Sync now">
                                        <ActionIcon
                                            variant="light"
                                            radius="md"
                                            color="ldDark.9"
                                            disabled={isSendingNowLoading}
                                            onClick={() => {
                                                track({
                                                    name: EventName.SCHEDULER_SEND_NOW_BUTTON,
                                                });
                                                mutateSendNow(sync);
                                            }}
                                        >
                                            <MantineIcon
                                                color="ldDark.9"
                                                icon={IconSend}
                                            />
                                        </ActionIcon>
                                    </Tooltip>

                                    <Tooltip withinPortal label="Edit">
                                        <ActionIcon
                                            variant="light"
                                            radius="md"
                                            color="ldDark.9"
                                            onClick={() => {
                                                setAction(SyncModalAction.EDIT);
                                                setCurrentSchedulerUuid(
                                                    sync.schedulerUuid,
                                                );
                                            }}
                                        >
                                            <MantineIcon
                                                color="ldDark.9"
                                                icon={IconPencil}
                                            />
                                        </ActionIcon>
                                    </Tooltip>

                                    <Tooltip withinPortal label="Delete">
                                        <ActionIcon
                                            variant="light"
                                            color="red"
                                            radius="md"
                                            onClick={() => {
                                                setAction(
                                                    SyncModalAction.DELETE,
                                                );
                                                setCurrentSchedulerUuid(
                                                    sync.schedulerUuid,
                                                );
                                            }}
                                        >
                                            <MantineIcon icon={IconTrash} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            ) : (
                <Group justify="center" ta="center" gap="xs" my="sm" pt="md">
                    <Text fz="sm" fw={450} c="ldGray.7">
                        This chart has no Syncs set up yet
                    </Text>
                    <Text fz="xs" fw={400} c="ldGray.6">
                        Get started by clicking 'Create new Sync' to seamlessly
                        integrate your chart data with Google Sheets
                    </Text>
                </Group>
            )}
        </MantineModal>
    );
};
