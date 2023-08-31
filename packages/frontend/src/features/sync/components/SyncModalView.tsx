import { SchedulerFormat } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Card,
    Flex,
    Menu,
    ScrollArea,
    Stack,
    Text,
} from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import cronstrue from 'cronstrue';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useChartSchedulers } from '../../../hooks/scheduler/useChartSchedulers';
import { SyncModalAction, useSyncModal } from '../providers/SyncModalProvider';

export const SyncModalView: FC<{ chartUuid: string }> = ({ chartUuid }) => {
    const { data } = useChartSchedulers(chartUuid);
    const { setAction, setCurrentSchedulerUuid } = useSyncModal();
    const googleSheetsSyncs = data?.filter(
        ({ format }) => format === SchedulerFormat.GSHEETS,
    );
    return (
        <Stack spacing="lg">
            {googleSheetsSyncs && googleSheetsSyncs.length ? (
                <ScrollArea h={450}>
                    <Stack>
                        {googleSheetsSyncs.map((sync) => (
                            <Card
                                key={sync.schedulerUuid}
                                withBorder
                                pos="relative"
                                p="xs"
                            >
                                <Stack spacing="xs">
                                    <Text fz="sm" fw={500}>
                                        {sync.name}
                                    </Text>

                                    <Flex align="center">
                                        <Text span size="xs" color="gray.6">
                                            {cronstrue.toString(sync.cron, {
                                                verbose: true,
                                                throwExceptionOnParseError:
                                                    false,
                                            })}
                                        </Text>
                                    </Flex>
                                </Stack>

                                <Menu
                                    shadow="md"
                                    withinPortal
                                    withArrow
                                    offset={{
                                        crossAxis: -4,
                                        mainAxis: -4,
                                    }}
                                    position="bottom-end"
                                >
                                    <Menu.Target>
                                        <ActionIcon
                                            pos="absolute"
                                            top={0}
                                            right={0}
                                        >
                                            <MantineIcon icon={IconDots} />
                                        </ActionIcon>
                                    </Menu.Target>

                                    <Menu.Dropdown>
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconPencil}
                                                />
                                            }
                                            onClick={() => {
                                                setAction(SyncModalAction.EDIT);
                                                setCurrentSchedulerUuid(
                                                    sync.schedulerUuid,
                                                );
                                            }}
                                        >
                                            Edit
                                        </Menu.Item>
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    color="red"
                                                    icon={IconTrash}
                                                />
                                            }
                                            onClick={() => {
                                                setAction(
                                                    SyncModalAction.DELETE,
                                                );
                                                setCurrentSchedulerUuid(
                                                    sync.schedulerUuid,
                                                );
                                            }}
                                        >
                                            Delete
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </Card>
                        ))}
                    </Stack>
                </ScrollArea>
            ) : (
                <Text>No Syncs found</Text>
            )}
            <Button
                size="sm"
                display="block"
                ml="auto"
                onClick={() => setAction(SyncModalAction.CREATE)}
            >
                Create New Sync
            </Button>
        </Stack>
    );
};
