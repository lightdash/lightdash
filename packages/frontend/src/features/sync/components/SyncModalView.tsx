import { SchedulerFormat } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Card,
    Flex,
    Group,
    Menu,
    Popover,
    ScrollArea,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconDots,
    IconInfoCircle,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import cronstrue from 'cronstrue';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useChartSchedulers } from '../../../features/scheduler/hooks/useChartSchedulers';
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
                <Group position="center" ta="center" spacing="xs" my="sm">
                    <Text fz="sm" fw={450} c="gray.7">
                        This chart has no Syncs set up yet
                    </Text>
                    <Text fz="xs" fw={400} c="gray.6">
                        Get started by clicking 'Create new Sync' to seamlessly
                        integrate your chart data with Google Sheets
                    </Text>
                </Group>
            )}
            <Flex justify="space-between" align="center">
                <Popover withinPortal width={150} withArrow>
                    <Popover.Target>
                        <Button
                            size="xs"
                            fz={9}
                            variant="subtle"
                            color="gray"
                            leftIcon={
                                <MantineIcon size={12} icon={IconInfoCircle} />
                            }
                        >
                            Google API Services User Data Policy
                        </Button>
                    </Popover.Target>

                    <Popover.Dropdown>
                        <Text fz={9}>
                            Lightdash's use and transfer of information received
                            from Google APIs adhere to{' '}
                            <Anchor
                                target="_blank"
                                href="https://developers.google.com/terms/api-services-user-data-policy"
                            >
                                Google API Services User Data Policy
                            </Anchor>
                            , including the Limited Use requirements.
                        </Text>
                    </Popover.Dropdown>
                </Popover>

                <Button
                    size="sm"
                    display="block"
                    ml="auto"
                    onClick={() => setAction(SyncModalAction.CREATE)}
                >
                    Create New Sync
                </Button>
            </Flex>
        </Stack>
    );
};
