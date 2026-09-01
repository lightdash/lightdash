import { subject } from '@casl/ability';
import {
    ContentReviewRequestStatus,
    ContentReviewRequestView,
    ContentType,
    getContentReviewRequestPath,
    getContentReviewRequestsPath,
    type ContentReviewRequestListItem,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { IconChartBar, IconLayoutDashboard } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../../components/common/ContentTable';
import MantineIcon from '../../../../components/common/MantineIcon';
import Page from '../../../../components/common/Page/Page';
import PageBreadcrumbs from '../../../../components/common/PageBreadcrumbs';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import ContentReviewStatusBadge from '../components/ContentReviewStatusBadge';
import { useContentReviewAvailability } from '../hooks/useContentReviewAvailability';
import { useContentReviewRequests } from '../hooks/useContentReviewRequests';
import { getContentHref, getContentTypeLabel } from '../utils';

const PAGE_SIZE = 200;

const STATUS_OPTIONS: {
    value: ContentReviewRequestStatus | 'all';
    label: string;
}[] = [
    { value: 'all', label: 'All statuses' },
    { value: ContentReviewRequestStatus.PENDING, label: 'Pending' },
    { value: ContentReviewRequestStatus.APPROVED, label: 'Approved' },
    { value: ContentReviewRequestStatus.REJECTED, label: 'Rejected' },
    { value: ContentReviewRequestStatus.CANCELLED, label: 'Cancelled' },
];

const RequestedAgo: FC<{ createdAt: Date }> = ({ createdAt }) => {
    const ago = useTimeAgo(new Date(createdAt));
    return (
        <Text fz="sm" c="ldGray.7">
            {ago}
        </Text>
    );
};

const ContentReviewRequestsPage: FC = () => {
    const projectUuid = useProjectUuid();
    const navigate = useNavigate();
    const { user } = useApp();
    const { isAvailable, isLoading: isLoadingAvailability } =
        useContentReviewAvailability();
    const canManageSettings =
        !!projectUuid &&
        (user.data?.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ??
            false);
    const [view, setView] = useState<ContentReviewRequestView>(
        ContentReviewRequestView.TO_REVIEW,
    );
    const [status, setStatus] = useState<ContentReviewRequestStatus | 'all'>(
        ContentReviewRequestStatus.PENDING,
    );

    const { data, isInitialLoading } = useContentReviewRequests(
        projectUuid ?? '',
        {
            view,
            status: status === 'all' ? null : status,
            page: 1,
            pageSize: PAGE_SIZE,
        },
        !!projectUuid && isAvailable,
    );
    const items = useMemo(() => data?.data ?? [], [data]);

    const columns: ContentTableColumnDef<ContentReviewRequestListItem>[] =
        useMemo(
            () => [
                {
                    accessorKey: 'content',
                    header: 'Content',
                    enableSorting: false,
                    size: 260,
                    Cell: ({ row }) => {
                        const { content, contentType } = row.original;
                        if (!content || !projectUuid) {
                            return (
                                <Text fz="sm" c="ldGray.6" fs="italic">
                                    Deleted content
                                </Text>
                            );
                        }
                        return (
                            <Anchor
                                component={Link}
                                to={getContentHref(
                                    projectUuid,
                                    contentType,
                                    content,
                                )}
                                fz="sm"
                                fw={500}
                                truncate="end"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {content.name}
                            </Anchor>
                        );
                    },
                },
                {
                    accessorKey: 'contentType',
                    header: 'Type',
                    enableSorting: false,
                    size: 120,
                    Cell: ({ row }) => {
                        const isChart =
                            row.original.contentType === ContentType.CHART;
                        return (
                            <Badge
                                variant="light"
                                color={isChart ? 'blue' : 'violet'}
                                leftSection={
                                    <MantineIcon
                                        icon={
                                            isChart
                                                ? IconChartBar
                                                : IconLayoutDashboard
                                        }
                                        size="sm"
                                    />
                                }
                            >
                                {getContentTypeLabel(row.original.contentType)}
                            </Badge>
                        );
                    },
                },
                {
                    accessorKey: 'requestedBy',
                    header: 'Requested by',
                    enableSorting: false,
                    size: 160,
                    Cell: ({ row }) => (
                        <Text fz="sm" c="ldGray.7">
                            {row.original.requestedBy.firstName}{' '}
                            {row.original.requestedBy.lastName}
                        </Text>
                    ),
                },
                {
                    accessorKey: 'targetSpaceName',
                    header: 'Target space',
                    enableSorting: false,
                    size: 160,
                    Cell: ({ row }) => (
                        <Text fz="sm" c="ldGray.7">
                            {row.original.targetSpaceName ?? 'Deleted space'}
                        </Text>
                    ),
                },
                {
                    accessorKey: 'status',
                    header: 'Status',
                    enableSorting: false,
                    size: 110,
                    Cell: ({ row }) => (
                        <ContentReviewStatusBadge
                            status={row.original.status}
                        />
                    ),
                },
                {
                    accessorKey: 'createdAt',
                    header: 'Requested',
                    enableSorting: false,
                    size: 140,
                    Cell: ({ row }) => (
                        <RequestedAgo createdAt={row.original.createdAt} />
                    ),
                },
            ],
            [projectUuid],
        );

    const table = useContentTable({
        columns,
        data: items,
        enableSorting: false,
        enablePagination: false,
        enableBottomToolbar: false,
        enableTopToolbar: false,
        enableRowSelection: false,
        enableStickyHeader: true,
        state: { isLoading: isInitialLoading },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(items.length),
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => {
                if (!projectUuid) return;
                void navigate(
                    getContentReviewRequestPath(projectUuid, row.original.uuid),
                );
            },
        }),
        renderEmptyRowsFallback: () => (
            <Text fz="sm" c="ldGray.6" ta="center" py="xl">
                {view === ContentReviewRequestView.TO_REVIEW
                    ? 'Nothing waiting for your review'
                    : 'You have not requested any reviews yet'}
            </Text>
        ),
    });

    if (!projectUuid) return null;
    if (!isLoadingAvailability && !isAvailable) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return (
        <Page
            title="Review requests"
            withCenteredContent
            withXLargePaddedContent
        >
            <Stack gap="md">
                <PageBreadcrumbs
                    items={[
                        {
                            title: 'Review requests',
                            to: getContentReviewRequestsPath(projectUuid),
                            active: true,
                        },
                    ]}
                />
                <Group justify="space-between">
                    <SegmentedControl
                        value={view}
                        onChange={(value) => {
                            const nextView = value as ContentReviewRequestView;
                            setView(nextView);
                            setStatus(
                                nextView === ContentReviewRequestView.TO_REVIEW
                                    ? ContentReviewRequestStatus.PENDING
                                    : 'all',
                            );
                        }}
                        data={[
                            {
                                value: ContentReviewRequestView.TO_REVIEW,
                                label: 'To review',
                            },
                            {
                                value: ContentReviewRequestView.MINE,
                                label: 'My requests',
                            },
                        ]}
                    />
                    <Group gap="sm">
                        {canManageSettings && (
                            <Anchor
                                component={Link}
                                to={`/generalSettings/projectManagement/${projectUuid}/reviewRequests`}
                                fz="sm"
                            >
                                Review settings
                            </Anchor>
                        )}
                        <Select
                            size="xs"
                            w={160}
                            value={status}
                            onChange={(value) =>
                                setStatus(
                                    (value as
                                        | ContentReviewRequestStatus
                                        | 'all') ?? 'all',
                                )
                            }
                            data={STATUS_OPTIONS}
                            allowDeselect={false}
                        />
                    </Group>
                </Group>
                <ContentTable table={table} />
            </Stack>
        </Page>
    );
};

export default ContentReviewRequestsPage;
