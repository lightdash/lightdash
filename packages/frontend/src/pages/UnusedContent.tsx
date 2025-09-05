import { type UnusedContentItem } from '@lightdash/common';
import {
    Anchor,
    Card,
    Group,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconArchive } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { type FC } from 'react';
import { useParams } from 'react-router';

dayjs.extend(relativeTime);

import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useUnusedContent } from '../hooks/analytics/useUserActivity';
import { useProject } from '../hooks/useProject';
import useApp from '../providers/App/useApp';

const VisualizationCard = ({
    children,
    description,
}: {
    children: React.ReactNode;
    description?: string;
}) => {
    return (
        <Card
            sx={{
                verticalAlign: 'middle',
                textAlign: 'center',
                overflow: 'auto',
            }}
            withBorder
        >
            <Text sx={{ float: 'left' }} fw={600} mb={10}>
                {description}
            </Text>
            {children}
        </Card>
    );
};

const UnusedContentTable: FC<{
    items: UnusedContentItem[];
    projectUuid: string;
    title: string;
}> = ({ items, projectUuid, title }) => {
    const getRelativeTime = (date: Date | null) => {
        if (!date) return 'Never viewed';
        return dayjs(date).fromNow();
    };

    const getContentLink = (item: UnusedContentItem) => {
        const baseUrl = `/projects/${projectUuid}`;
        if (item.contentType === 'chart') {
            return `${baseUrl}/saved/${item.contentUuid}`;
        } else if (item.contentType === 'dashboard') {
            return `${baseUrl}/dashboards/${item.contentUuid}`;
        }
        return '#';
    };

    if (items.length === 0) {
        return (
            <VisualizationCard description={title}>
                <SuboptimalState
                    title="No content found"
                    description="All content in this category has been viewed recently."
                />
            </VisualizationCard>
        );
    }

    return (
        <VisualizationCard description={title}>
            <Table withColumnBorders ta="left">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Views</th>
                        <th>Last Viewed</th>
                        <th>Created By</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={`${item.contentType}-${item.contentUuid}`}>
                            <td>
                                <Anchor
                                    href={getContentLink(item)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {item.contentName}
                                </Anchor>
                            </td>
                            <td>{item.viewsCount}</td>
                            <td>
                                {item.lastViewedAt ? (
                                    <Tooltip
                                        label={dayjs(item.lastViewedAt).format(
                                            'MMM DD, YYYY HH:mm:ss',
                                        )}
                                        position="top"
                                        withArrow
                                    >
                                        <span style={{ cursor: 'help' }}>
                                            {getRelativeTime(item.lastViewedAt)}
                                        </span>
                                    </Tooltip>
                                ) : (
                                    'Never viewed'
                                )}
                            </td>
                            <td>{item.createdByUserName}</td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </VisualizationCard>
    );
};

const UnusedContent: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(params.projectUuid);
    const { user: sessionUser } = useApp();

    const { data: unusedContent, isInitialLoading } = useUnusedContent(
        params.projectUuid,
    );

    if (sessionUser.data?.ability?.cannot('view', 'Analytics')) {
        return <ForbiddenPanel />;
    }

    if (isInitialLoading || unusedContent === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    return (
        <Page title={`Least viewed content in ${project?.name}`} withFitContent>
            <Group mt={10} mb={30} position="apart">
                <PageBreadcrumbs
                    items={[
                        {
                            title: 'Usage analytics',
                            to: `/generalSettings/projectManagement/${params.projectUuid}/usageAnalytics`,
                        },
                        {
                            title: (
                                <Group
                                    style={{
                                        display: 'flex',
                                        gap: 6,
                                        alignItems: 'center',
                                    }}
                                >
                                    <MantineIcon icon={IconArchive} size={20} />
                                    Least viewed content in {project?.name}
                                </Group>
                            ),
                            active: true,
                        },
                    ]}
                />
            </Group>

            <Stack spacing="lg">
                <Text size="sm" color="dimmed">
                    This shows the 10 charts and dashboards that have the fewest
                    views, sorted by last viewed date. This content may be
                    candidates for cleanup or archiving.
                </Text>

                <UnusedContentTable
                    items={unusedContent.charts}
                    projectUuid={params.projectUuid!}
                    title="Least viewed charts"
                />

                <UnusedContentTable
                    items={unusedContent.dashboards}
                    projectUuid={params.projectUuid!}
                    title="Least viewed dashboards"
                />
            </Stack>
        </Page>
    );
};

export default UnusedContent;
