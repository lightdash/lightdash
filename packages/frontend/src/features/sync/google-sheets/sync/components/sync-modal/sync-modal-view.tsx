import { SchedulerFormat } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Card,
    Flex,
    List,
    Menu,
    Stack,
    Text,
} from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import cronstrue from 'cronstrue';
import { FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { SeparatorDot } from '../../../../../../components/common/PageHeader';
import { useChartSchedulers } from '../../../../../../hooks/scheduler/useChartSchedulers';
import {
    SyncWithGoogleSheetsModalAction,
    useSyncWithGoogleSheetsModal,
} from '../../hooks/use-sync-with-google-sheets-modal-provider';

export const SyncModalView: FC<{ chartUuid: string }> = ({ chartUuid }) => {
    const { data } = useChartSchedulers(chartUuid);
    const { setAction } = useSyncWithGoogleSheetsModal();
    const googleSheetsSyncs = data?.filter(
        ({ format }) => format === SchedulerFormat.GSHEETS,
    );
    return (
        <Stack spacing="lg">
            {googleSheetsSyncs && googleSheetsSyncs.length ? (
                <List listStyleType="none">
                    {googleSheetsSyncs.map((sync) => (
                        <List.Item key={sync.schedulerUuid} mb="sm">
                            <Card withBorder pos="relative">
                                <Stack spacing="xs">
                                    <Text fw={500}>{sync.name}</Text>

                                    <Flex align="center">
                                        <Text span size="xs" color="gray.6">
                                            {cronstrue.toString(sync.cron, {
                                                verbose: true,
                                                throwExceptionOnParseError:
                                                    false,
                                            })}
                                        </Text>

                                        <SeparatorDot icon="dot" size={6} />
                                        <Text span size="xs" color="gray.6">
                                            {sync.targets.length} recipients
                                        </Text>
                                    </Flex>
                                </Stack>

                                <Menu
                                    shadow="md"
                                    width={200}
                                    withinPortal
                                    position="right-start"
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
                                            //TODO: add edit action
                                            icon={
                                                <MantineIcon
                                                    icon={IconPencil}
                                                />
                                            }
                                            onClick={() =>
                                                setAction(
                                                    SyncWithGoogleSheetsModalAction.EDIT,
                                                )
                                            }
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
                                            //TODO: add delete action
                                            onClick={() => {}}
                                        >
                                            Delete
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </Card>
                        </List.Item>
                    ))}
                </List>
            ) : (
                <Text>No Syncs found</Text>
            )}
            <Button
                size="sm"
                display="block"
                ml="auto"
                onClick={() =>
                    setAction(SyncWithGoogleSheetsModalAction.CREATE)
                }
            >
                Create New Sync
            </Button>
        </Stack>
    );
};
