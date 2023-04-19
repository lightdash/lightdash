import { getHumanReadableCronExpression } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Card,
    Group,
    Loader,
    Table,
    Title,
    Tooltip,
} from '@mantine/core';
import { FC } from 'react';
import { useSchedulerLogs } from '../../hooks/scheduler/useScheduler';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsScheduledDeliveries: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const { data, isLoading } = useSchedulerLogs(projectUuid);
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
        <Card withBorder shadow="xs">
            <Title order={5}>Run history</Title>
            <Table
                my="md"
                verticalSpacing="md"
                horizontalSpacing="md"
                highlightOnHover
            >
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Name</th>
                        <th>Scheduled content</th>
                        <th>Delivery started</th>
                        <th>Schedule</th>
                    </tr>
                </thead>
                <tbody>
                    {data && data.length !== 0 ? (
                        data.map((scheduler) => {
                            return (
                                <tr key={scheduler.schedulerUuid}>
                                    <td>
                                        {scheduler.logs[0]
                                            ? renderStatusBadge(
                                                  scheduler.logs[0].status,

                                                  scheduler.logs[0].details ||
                                                      undefined,
                                              )
                                            : renderStatusBadge('no status')}
                                    </td>
                                    <td>{scheduler.name}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {scheduler.dashboardUuid !== null ? (
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
                                        {scheduler.logs[0]
                                            ? new Date(
                                                  scheduler.logs[0].scheduledTime,
                                              ).toLocaleString('en-US', {
                                                  timeZone: 'UTC',
                                                  dateStyle: 'full',
                                                  timeStyle: 'medium',
                                              })
                                            : 'Delivery not started yet'}
                                    </td>
                                    <td>
                                        {getHumanReadableCronExpression(
                                            scheduler.cron,
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
                                    No scheduled deliveries on this project yet.
                                </Title>
                            </td>
                        </tr>
                    )}
                </tbody>
            </Table>
        </Card>
    );
};

export default SettingsScheduledDeliveries;
