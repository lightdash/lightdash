import {
    getHumanReadableCronExpression,
    isSlackTarget,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Card,
    Group,
    Loader,
    Modal,
    Table,
    Tabs,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconClock, IconDots, IconPencil, IconSend } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useSchedulerLogs } from '../../hooks/scheduler/useScheduler';
import MantineIcon from '../common/MantineIcon';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const ListTargets: FC<{ targets: string[] }> = ({ targets }) => {
    const [isOpen, setIsOpen] = useState(false);
    if (targets.length === 0) {
        return <p>No targets</p>;
    }

    return (
        <>
            {targets.slice(0, 2).map((target) => (
                <p key={target}>{target}</p>
            ))}

            {targets.length > 2 && (
                <>
                    <Anchor onClick={() => setIsOpen(true)}>
                        {`+${targets.length - 2} more contacts`}
                    </Anchor>

                    {isOpen && (
                        <Modal
                            title={'Contacts list'}
                            opened={true}
                            onClose={() => setIsOpen(false)}
                        >
                            {targets.map((target) => (
                                <p key={target}>{target}</p>
                            ))}
                        </Modal>
                    )}
                </>
            )}
        </>
    );
};

const SettingsScheduledDeliveries: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const { data, isLoading } = useSchedulerLogs(projectUuid);
    const formatTime = (date: Date) => {
        return new Date(date).toLocaleString('en-US', {
            timeZone: 'UTC',
            dateStyle: 'short',
            timeStyle: 'short',
        });
    };
    const renderStatusBadge = (
        status: string,
        details?: Record<string, any | undefined>,
    ) => {
        switch (status) {
            case 'scheduled': {
                return (
                    <Badge color="indigo" my="xs">
                        Scheduled
                    </Badge>
                );
            }
            case 'started': {
                return <Badge my="xs">Started</Badge>;
            }
            case 'completed': {
                return (
                    <Badge color="green" my="xs">
                        Completed
                    </Badge>
                );
            }
            case 'error': {
                return (
                    <Tooltip label={details?.error || ''}>
                        <Badge color="red" my="xs">
                            Error
                        </Badge>
                    </Tooltip>
                );
            }
            case 'no status': {
                return (
                    <Badge color="gray" my="xs">
                        Status unavailable
                    </Badge>
                );
            }
        }
    };

    return (
        <Card withBorder shadow="xs" style={{ width: 1000, marginLeft: -100 }}>
            <Tabs defaultValue="scheduled-deliveries" mb="sm">
                <Tabs.List>
                    <Tabs.Tab
                        value="scheduled-deliveries"
                        icon={<MantineIcon icon={IconSend} size={14} />}
                    >
                        <Title order={6} fw={500}>
                            All schedulers
                        </Title>
                    </Tabs.Tab>
                    <Tabs.Tab
                        value="run-history"
                        icon={<MantineIcon icon={IconClock} size={14} />}
                        mx="sm"
                    >
                        <Title order={6} fw={500}>
                            Run history
                        </Title>
                    </Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="scheduled-deliveries">
                    <Table my="sm" horizontalSpacing="sm">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Content</th>
                                <th>Created by</th>

                                <th>Type</th>
                                <th>Send to</th>

                                <th>Frequency</th>
                                <th>Last delivery</th>
                                <th>Next delivery</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data &&
                            data.schedulers &&
                            data.schedulers.length !== 0 ? (
                                data.schedulers.map((scheduler) => {
                                    const logs = data.logs
                                        ? data.logs.filter(
                                              (log) =>
                                                  log.schedulerUuid ===
                                                  scheduler.schedulerUuid,
                                          )
                                        : [];
                                    const lastDelivery = logs.find(
                                        (log) => log.status != 'scheduled',
                                    );
                                    const nextDelivery = logs
                                        .reverse()
                                        .find(
                                            (log) =>
                                                log.status === 'scheduled' &&
                                                new Date(log.scheduledTime) >
                                                    new Date(),
                                        );
                                    const editIcon = (
                                        <ActionIcon
                                            sx={(theme) => ({
                                                ':hover': {
                                                    backgroundColor:
                                                        theme.colors.gray[1],
                                                },
                                            })}
                                        >
                                            <MantineIcon
                                                icon={IconPencil}
                                                size={16}
                                            />
                                        </ActionIcon>
                                    );

                                    return (
                                        <tr key={scheduler.schedulerUuid}>
                                            <td>{scheduler.name}</td>
                                            <td>
                                                {scheduler.dashboardUuid !==
                                                null ? (
                                                    <Anchor
                                                        href={`/projects/${projectUuid}/dashboards/${scheduler?.dashboardUuid}/view`}
                                                        target="_blank"
                                                    >
                                                        View dashboard
                                                    </Anchor>
                                                ) : (
                                                    <Anchor
                                                        href={`/projects/${projectUuid}/saved/${scheduler?.savedChartUuid}/view`}
                                                        target="_blank"
                                                    >
                                                        View chart
                                                    </Anchor>
                                                )}
                                            </td>
                                            <td>
                                                {
                                                    data.users.find(
                                                        (u) =>
                                                            u.userUuid ===
                                                            scheduler.createdBy,
                                                    )?.name
                                                }
                                            </td>
                                            <td>{scheduler.format}</td>
                                            <td>
                                                <ListTargets
                                                    targets={scheduler.targets.map(
                                                        (target) =>
                                                            isSlackTarget(
                                                                target,
                                                            )
                                                                ? target.channel
                                                                : target.recipient,
                                                    )}
                                                />
                                            </td>
                                            <td>
                                                <Text fz="xs">
                                                    {getHumanReadableCronExpression(
                                                        scheduler.cron,
                                                    )}
                                                </Text>
                                            </td>

                                            <td>
                                                {lastDelivery ? (
                                                    <>
                                                        {formatTime(
                                                            lastDelivery.scheduledTime,
                                                        )}
                                                        {renderStatusBadge(
                                                            lastDelivery.status,
                                                            lastDelivery.details
                                                                ? lastDelivery.details
                                                                : undefined,
                                                        )}
                                                    </>
                                                ) : (
                                                    'No deliveries yet'
                                                )}
                                            </td>
                                            <td>
                                                {nextDelivery
                                                    ? formatTime(
                                                          nextDelivery.scheduledTime,
                                                      )
                                                    : 'No deliveries yet'}
                                            </td>
                                            <td>
                                                {scheduler.dashboardUuid !==
                                                null ? (
                                                    <Anchor
                                                        href={`/projects/${projectUuid}/dashboards/${scheduler?.dashboardUuid}/view/?scheduler_uuid=${scheduler.schedulerUuid}`}
                                                        target="_blank"
                                                    >
                                                        {editIcon}
                                                    </Anchor>
                                                ) : (
                                                    <Anchor
                                                        href={`/projects/${projectUuid}/saved/${scheduler?.savedChartUuid}/view/?scheduler_uuid=${scheduler.schedulerUuid}`}
                                                        target="_blank"
                                                    >
                                                        {editIcon}
                                                    </Anchor>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : isLoading ? (
                                <tr>
                                    <td colSpan={5}>
                                        <Group position="center" spacing="xs">
                                            <Loader size="xs" color="gray" />
                                            <Title
                                                order={6}
                                                ta="center"
                                                fw={500}
                                                color="gray.6"
                                            >
                                                Scheduled deliveries loading...
                                            </Title>
                                        </Group>
                                    </td>
                                </tr>
                            ) : (
                                <tr>
                                    <td colSpan={5}>
                                        <Title
                                            order={6}
                                            ta="center"
                                            fw={500}
                                            color="gray.6"
                                        >
                                            No scheduled deliveries on this
                                            project yet.
                                        </Title>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </Table>
                </Tabs.Panel>
                <Tabs.Panel value="run-history">
                    <Table my="xs" horizontalSpacing="sm" highlightOnHover>
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Name</th>
                                <th>Content</th>
                                <th>Created by</th>
                                <th>Type</th>
                                <th>Send to</th>
                                <th>Frequency</th>
                                <th>Delivery start</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data &&
                            data.schedulers &&
                            data.logs &&
                            data.schedulers.length !== 0 &&
                            data.logs.length !== 0 ? (
                                data.logs.map((log) => {
                                    const scheduler = data.schedulers.filter(
                                        (s) =>
                                            s.schedulerUuid ===
                                            log.schedulerUuid,
                                    )[0];
                                    return (
                                        <tr key={log.schedulerUuid}>
                                            <td>
                                                {log.status
                                                    ? renderStatusBadge(
                                                          log.status,
                                                          log.details
                                                              ? log.details
                                                              : undefined,
                                                      )
                                                    : renderStatusBadge(
                                                          'no status',
                                                      )}
                                            </td>
                                            <td>{scheduler.name}</td>
                                            <td>
                                                {scheduler.dashboardUuid !==
                                                null ? (
                                                    <Anchor
                                                        href={`/projects/${projectUuid}/dashboards/${scheduler?.dashboardUuid}/view`}
                                                        target="_blank"
                                                    >
                                                        View dashboard
                                                    </Anchor>
                                                ) : (
                                                    <Anchor
                                                        href={`/projects/${projectUuid}/saved/${scheduler?.savedChartUuid}/view`}
                                                        target="_blank"
                                                    >
                                                        View chart
                                                    </Anchor>
                                                )}
                                            </td>
                                            <td>
                                                {
                                                    data.users.find(
                                                        (u) =>
                                                            u.userUuid ===
                                                            scheduler.createdBy,
                                                    )?.name
                                                }
                                            </td>
                                            <td>{scheduler.format}</td>
                                            <td>
                                                {log.target ? (
                                                    <p>{log.target}</p>
                                                ) : (
                                                    <ListTargets
                                                        targets={scheduler.targets.map(
                                                            (target) =>
                                                                isSlackTarget(
                                                                    target,
                                                                )
                                                                    ? target.channel
                                                                    : target.recipient,
                                                        )}
                                                    />
                                                )}
                                            </td>
                                            <td>
                                                <Text fz="xs">
                                                    {getHumanReadableCronExpression(
                                                        scheduler.cron,
                                                    )}
                                                </Text>
                                            </td>
                                            <td>
                                                {log.scheduledTime
                                                    ? formatTime(
                                                          log.scheduledTime,
                                                      )
                                                    : 'Delivery not started yet'}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : isLoading ? (
                                <tr>
                                    <td colSpan={5}>
                                        <Group position="center" spacing="xs">
                                            <Loader size="xs" color="gray" />
                                            <Title
                                                order={6}
                                                ta="center"
                                                fw={500}
                                                color="gray.6"
                                            >
                                                Scheduled deliveries loading...
                                            </Title>
                                        </Group>
                                    </td>
                                </tr>
                            ) : (
                                <tr>
                                    <td colSpan={5}>
                                        <Title
                                            order={6}
                                            ta="center"
                                            fw={500}
                                            color="gray.6"
                                        >
                                            No scheduled deliveries on this
                                            project yet.
                                        </Title>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </Table>
                </Tabs.Panel>
            </Tabs>
        </Card>
    );
};

export default SettingsScheduledDeliveries;
