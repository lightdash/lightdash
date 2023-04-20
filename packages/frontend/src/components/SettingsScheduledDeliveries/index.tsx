import { getHumanReadableCronExpression } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Card,
    Group,
    Loader,
    Table,
    Tabs,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconClock, IconSend } from '@tabler/icons-react';
import { FC } from 'react';
import { useSchedulerLogs } from '../../hooks/scheduler/useScheduler';
import MantineIcon from '../common/MantineIcon';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsScheduledDeliveries: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const { data, isLoading } = useSchedulerLogs(projectUuid);
    console.log({ data });
    const renderStatusBadge = (
        status: string,
        details?: Record<string, any | undefined>,
    ) => {
        switch (status) {
            case 'scheduled': {
                return <Badge color="indigo">Scheduled</Badge>;
            }
            case 'started': {
                return <Badge>Started</Badge>;
            }
            case 'completed': {
                return <Badge color="green">Completed</Badge>;
            }
            case 'error': {
                return (
                    <Tooltip label={details?.error || ''}>
                        <Badge color="red">Error</Badge>
                    </Tooltip>
                );
            }
            case 'no status': {
                return <Badge color="gray">Status unavailable</Badge>;
            }
        }
    };

    return (
        <>
            <Card withBorder shadow="xs">
                <Tabs
                    defaultValue="scheduled-deliveries"
                    // variant="pills"
                    mb="sm"
                >
                    <Tabs.List>
                        <Tabs.Tab
                            value="scheduled-deliveries"
                            icon={<MantineIcon icon={IconSend} size={14} />}
                        >
                            <Title order={6} fw={500}>
                                All scheduled deliveries
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
                        <Table my="sm" horizontalSpacing="md" highlightOnHover>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Content</th>
                                    <th>Frequency</th>
                                    <th>Last delivery</th>
                                    <th>Next delivery</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data &&
                                data.schedulers &&
                                data.schedulers.length !== 0 ? (
                                    data.schedulers.map((scheduler) => {
                                        // I exposed the logs here, may be useful for next and last delivery!
                                        const logs = data.logs
                                            ? data.logs.filter(
                                                  (log) =>
                                                      log.schedulerUuid ===
                                                      scheduler.schedulerUuid,
                                              )
                                            : [];
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
                                                            Scheduled dashboard
                                                        </Anchor>
                                                    ) : (
                                                        <Anchor
                                                            href={`/projects/${projectUuid}/saved/${scheduler?.savedChartUuid}/view`}
                                                            target="_blank"
                                                        >
                                                            Scheduled chart
                                                        </Anchor>
                                                    )}
                                                </td>
                                                <td>
                                                    {getHumanReadableCronExpression(
                                                        scheduler.cron,
                                                    )}
                                                </td>
                                                <td>{/* LAST DELIVERY */}</td>
                                                <td>{/* NEXT DELIVERY */}</td>
                                            </tr>
                                        );
                                    })
                                ) : isLoading ? (
                                    <tr>
                                        <td colSpan={5}>
                                            <Group
                                                position="center"
                                                spacing="xs"
                                            >
                                                <Loader
                                                    size="xs"
                                                    color="gray"
                                                />
                                                <Title
                                                    order={6}
                                                    ta="center"
                                                    fw={500}
                                                    color="gray.6"
                                                >
                                                    Scheduled deliveries
                                                    loading...
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
                        <Table my="sm" horizontalSpacing="md" highlightOnHover>
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Name</th>
                                    <th>Content</th>
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
                                        const scheduler =
                                            data.schedulers.filter(
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
                                                            Scheduled dashboard
                                                        </Anchor>
                                                    ) : (
                                                        <Anchor
                                                            href={`/projects/${projectUuid}/saved/${scheduler?.savedChartUuid}/view`}
                                                            target="_blank"
                                                        >
                                                            Scheduled chart
                                                        </Anchor>
                                                    )}
                                                </td>
                                                <td>
                                                    {getHumanReadableCronExpression(
                                                        scheduler.cron,
                                                    )}
                                                </td>
                                                <td>
                                                    {log.scheduledTime
                                                        ? new Date(
                                                              log.scheduledTime,
                                                          ).toLocaleString(
                                                              'en-US',
                                                              {
                                                                  timeZone:
                                                                      'UTC',
                                                                  dateStyle:
                                                                      'short',
                                                                  timeStyle:
                                                                      'short',
                                                              },
                                                          )
                                                        : 'Delivery not started yet'}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : isLoading ? (
                                    <tr>
                                        <td colSpan={5}>
                                            <Group
                                                position="center"
                                                spacing="xs"
                                            >
                                                <Loader
                                                    size="xs"
                                                    color="gray"
                                                />
                                                <Title
                                                    order={6}
                                                    ta="center"
                                                    fw={500}
                                                    color="gray.6"
                                                >
                                                    Scheduled deliveries
                                                    loading...
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
        </>
    );
};

export default SettingsScheduledDeliveries;
