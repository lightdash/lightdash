import { subject } from '@casl/ability';
import {
    ContentReviewRequestStatus,
    ContentReviewRequestView,
    getContentReviewRequestPath,
    type ContentReviewRequestListItem,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconFolder, IconInbox, IconSettings } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../../components/common/ContentTable';
import MantineIcon from '../../../../components/common/MantineIcon';
import Page from '../../../../components/common/Page/Page';
import { IconBox } from '../../../../components/common/ResourceIcon';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import ContentReviewStatusBadge from '../components/ContentReviewStatusBadge';
import ContentReviewUserChip from '../components/ContentReviewUserChip';
import { useContentReviewAvailability } from '../hooks/useContentReviewAvailability';
import { useContentReviewRequests } from '../hooks/useContentReviewRequests';
import {
    getContentHref,
    getContentTypeColor,
    getContentTypeIcon,
    getContentTypeLabel,
} from '../utils';

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
        <Text fz="sm" c="dimmed">
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
                    size: 320,
                    Cell: ({ row }) => {
                        const { content, contentType } = row.original;
                        return (
                            <Group gap="sm" wrap="nowrap">
                                <IconBox
                                    icon={getContentTypeIcon(contentType)}
                                    color={getContentTypeColor(contentType)}
                                    boxSize={28}
                                    size="md"
                                />
                                <Stack gap={0} miw={0}>
                                    {content && projectUuid ? (
                                        <Anchor
                                            component={Link}
                                            to={getContentHref(
                                                projectUuid,
                                                contentType,
                                                content,
                                            )}
                                            fz="sm"
                                            fw={500}
                                            c="text"
                                            truncate="end"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {content.name}
                                        </Anchor>
                                    ) : (
                                        <Text fz="sm" c="dimmed" fs="italic">
                                            Deleted content
                                        </Text>
                                    )}
                                    <Text fz="xs" c="dimmed">
                                        {getContentTypeLabel(contentType)}
                                    </Text>
                                </Stack>
                            </Group>
                        );
                    },
                },
                {
                    accessorKey: 'requestedBy',
                    header: 'Requested by',
                    enableSorting: false,
                    size: 180,
                    Cell: ({ row }) => (
                        <ContentReviewUserChip
                            user={row.original.requestedBy}
                        />
                    ),
                },
                {
                    accessorKey: 'targetSpaceName',
                    header: 'Moving to',
                    enableSorting: false,
                    size: 180,
                    Cell: ({ row }) => (
                        <Group gap={6} wrap="nowrap">
                            <MantineIcon icon={IconFolder} color="dimmed" />
                            <Text fz="sm" truncate="end">
                                {row.original.targetSpaceName ??
                                    'Deleted space'}
                            </Text>
                        </Group>
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
            <Stack align="center" gap="xs" py="xl">
                <MantineIcon icon={IconInbox} size="xl" color="dimmed" />
                <Text fz="sm" fw={500}>
                    {view === ContentReviewRequestView.TO_REVIEW
                        ? 'Nothing waiting for your review'
                        : 'You have not requested any reviews yet'}
                </Text>
                <Text fz="xs" c="dimmed" ta="center" maw={360}>
                    {view === ContentReviewRequestView.TO_REVIEW
                        ? 'Requests to move content into spaces you can edit will show up here.'
                        : 'Open a chart or dashboard in your personal space and choose Request review.'}
                </Text>
            </Stack>
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
            <Stack gap="lg">
                <Group justify="space-between" align="flex-start">
                    <Stack gap={4}>
                        <Title order={3}>Review requests</Title>
                        <Text fz="sm" c="dimmed">
                            Charts and dashboards waiting to move from a
                            personal space into a shared one.
                        </Text>
                    </Stack>
                    {canManageSettings && (
                        <Button
                            component={Link}
                            to={`/generalSettings/projectManagement/${projectUuid}/reviewRequests`}
                            variant="default"
                            size="xs"
                            leftSection={<MantineIcon icon={IconSettings} />}
                        >
                            Review settings
                        </Button>
                    )}
                </Group>
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
                    <Select
                        size="xs"
                        w={160}
                        value={status}
                        onChange={(value) =>
                            setStatus(
                                (value as ContentReviewRequestStatus | 'all') ??
                                    'all',
                            )
                        }
                        data={STATUS_OPTIONS}
                        allowDeselect={false}
                    />
                </Group>
                <ContentTable table={table} />
            </Stack>
        </Page>
    );
};

export default ContentReviewRequestsPage;
