import {
    assertUnreachable,
    ContentReviewContentType,
    ContentReviewRequestStatus,
    getContentReviewRequestsPath,
    type ContentReviewRequestDetail,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Checkbox,
    Grid,
    Group,
    Paper,
    Stack,
    Text,
    Textarea,
    Timeline,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconArrowRight,
    IconCheck,
    IconCircleCheckFilled,
    IconClockHour4,
    IconExternalLink,
    IconFolder,
    IconSend,
    IconUser,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useParams } from 'react-router';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import Page from '../../../../components/common/Page/Page';
import PageBreadcrumbs from '../../../../components/common/PageBreadcrumbs';
import { IconBox } from '../../../../components/common/ResourceIcon';
import { SettingsEmptyState } from '../../../../components/common/Settings/SettingsEmptyState';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import ContentReviewItemRow from '../components/ContentReviewItemRow';
import ContentReviewStatusBadge from '../components/ContentReviewStatusBadge';
import ContentReviewUserChip from '../components/ContentReviewUserChip';
import {
    useApproveContentReviewRequest,
    useCancelContentReviewRequest,
    useContentReviewRequest,
    useRejectContentReviewRequest,
} from '../hooks/useContentReviewRequests';
import {
    getContentHref,
    getContentTypeColor,
    getContentTypeIcon,
    getContentTypeLabel,
    getContentTypeNoun,
    getUserFullName,
} from '../utils';
import classes from './ContentReviewRequestPage.module.css';

const TimeAgo: FC<{ date: Date }> = ({ date }) => {
    const ago = useTimeAgo(new Date(date));
    return (
        <Text fz="xs" c="dimmed">
            {ago}
        </Text>
    );
};

const RejectModal: FC<{
    opened: boolean;
    onClose: () => void;
    onConfirm: (note: string) => Promise<void>;
    isLoading: boolean;
}> = ({ opened, onClose, onConfirm, isLoading }) => {
    const [note, setNote] = useState('');
    const canConfirm = note.trim().length > 0;
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Reject request"
            icon={IconX}
            actions={
                <Button
                    color="red"
                    loading={isLoading}
                    disabled={!canConfirm}
                    onClick={async () => {
                        await onConfirm(note.trim());
                        setNote('');
                    }}
                >
                    Reject
                </Button>
            }
        >
            <Textarea
                label="Tell the requester why"
                description="They will see this note and can resubmit after changes"
                autosize
                minRows={3}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                data-autofocus
            />
        </MantineModal>
    );
};

const SpaceChip: FC<{ name: string; personal?: boolean }> = ({
    name,
    personal = false,
}) => (
    <Group gap={6} wrap="nowrap" className={classes.spaceChip}>
        <MantineIcon icon={personal ? IconUser : IconFolder} color="dimmed" />
        <Text fz="sm" fw={500} truncate="end">
            {name}
        </Text>
    </Group>
);

const DecisionCard: FC<{
    request: ContentReviewRequestDetail;
    projectUuid: string;
}> = ({ request, projectUuid }) => {
    const [verify, setVerify] = useState(
        request.verifyByDefault && request.canVerify,
    );
    const [isRejectOpen, rejectHandlers] = useDisclosure(false);
    const { mutateAsync: approve, isLoading: isApproving } =
        useApproveContentReviewRequest(projectUuid);
    const { mutateAsync: reject, isLoading: isRejecting } =
        useRejectContentReviewRequest(projectUuid);
    const itemCount = request.moveSet.length;
    const target = request.targetSpaceName ?? 'the target space';

    return (
        <Paper p="md">
            <Stack gap="md">
                <Stack gap={4}>
                    <Title order={5}>Your decision</Title>
                    <Text fz="sm" c="dimmed">
                        Approving moves{' '}
                        {itemCount === 1 ? 'this item' : `${itemCount} items`}{' '}
                        to {target} and releases the temporary access.
                    </Text>
                </Stack>
                <Tooltip
                    label={
                        request.contentType ===
                        ContentReviewContentType.SQL_CHART
                            ? 'SQL charts cannot be verified yet'
                            : 'You need permission to verify content'
                    }
                    disabled={request.canVerify}
                    withArrow
                >
                    <Checkbox
                        label="Verify on approve"
                        description="Marks it as the trusted version in the shared space"
                        checked={verify}
                        disabled={!request.canVerify}
                        onChange={(event) =>
                            setVerify(event.currentTarget.checked)
                        }
                    />
                </Tooltip>
                <Stack gap="xs">
                    <Button
                        fullWidth
                        loading={isApproving}
                        leftSection={<MantineIcon icon={IconCheck} />}
                        onClick={() =>
                            approve({
                                requestUuid: request.uuid,
                                body: { verify, note: null },
                            })
                        }
                    >
                        Approve and move
                    </Button>
                    <Button
                        fullWidth
                        variant="default"
                        color="red"
                        onClick={rejectHandlers.open}
                        disabled={isApproving}
                    >
                        Reject
                    </Button>
                </Stack>
            </Stack>
            <RejectModal
                opened={isRejectOpen}
                onClose={rejectHandlers.close}
                isLoading={isRejecting}
                onConfirm={async (note) => {
                    await reject({
                        requestUuid: request.uuid,
                        body: { note },
                    });
                    rejectHandlers.close();
                }}
            />
        </Paper>
    );
};

const WaitingCard: FC<{
    request: ContentReviewRequestDetail;
    projectUuid: string;
}> = ({ request, projectUuid }) => {
    const { mutate: cancel, isLoading: isCancelling } =
        useCancelContentReviewRequest(projectUuid);
    return (
        <Paper p="md">
            <Stack gap="md">
                <Stack gap={4}>
                    <Title order={5}>Waiting for a reviewer</Title>
                    <Text fz="sm" c="dimmed">
                        Reviewers for{' '}
                        {request.targetSpaceName ?? 'the target space'} have
                        been notified. You can pull the request back at any
                        time.
                    </Text>
                </Stack>
                <Button
                    fullWidth
                    variant="default"
                    loading={isCancelling}
                    onClick={() => cancel(request.uuid)}
                >
                    Cancel request
                </Button>
            </Stack>
        </Paper>
    );
};

const getDecisionLabel = (status: ContentReviewRequestStatus): string => {
    switch (status) {
        case ContentReviewRequestStatus.APPROVED:
            return 'Approved';
        case ContentReviewRequestStatus.REJECTED:
            return 'Rejected';
        case ContentReviewRequestStatus.CANCELLED:
            return 'Cancelled';
        case ContentReviewRequestStatus.PENDING:
            return 'Pending';
        default:
            return assertUnreachable(status, 'Unknown review request status');
    }
};

const ActivityCard: FC<{ request: ContentReviewRequestDetail }> = ({
    request,
}) => {
    const isPending = request.status === ContentReviewRequestStatus.PENDING;
    const isApproved = request.status === ContentReviewRequestStatus.APPROVED;
    const decisionLabel = getDecisionLabel(request.status);

    return (
        <Paper p="md">
            <Stack gap="md">
                <Title order={5}>Activity</Title>
                <Timeline
                    active={isPending ? 0 : 1}
                    bulletSize={22}
                    lineWidth={2}
                >
                    <Timeline.Item
                        bullet={<MantineIcon icon={IconSend} size={12} />}
                        title={
                            <Text fz="sm" fw={500}>
                                Requested by{' '}
                                {getUserFullName(request.requestedBy)}
                            </Text>
                        }
                    >
                        <TimeAgo date={request.createdAt} />
                    </Timeline.Item>
                    {isPending ? (
                        <Timeline.Item
                            bullet={
                                <MantineIcon icon={IconClockHour4} size={12} />
                            }
                            title={
                                <Text fz="sm" fw={500} c="dimmed">
                                    Waiting for review
                                </Text>
                            }
                        />
                    ) : (
                        <Timeline.Item
                            bullet={
                                <MantineIcon
                                    icon={isApproved ? IconCheck : IconX}
                                    size={12}
                                />
                            }
                            color={isApproved ? 'green' : 'red'}
                            title={
                                <Group gap="xs">
                                    <Text fz="sm" fw={500}>
                                        {decisionLabel}
                                        {request.reviewedBy
                                            ? ` by ${getUserFullName(request.reviewedBy)}`
                                            : ''}
                                    </Text>
                                    {request.verifiedOnApprove && (
                                        <Badge
                                            size="xs"
                                            color="green"
                                            variant="light"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconCircleCheckFilled}
                                                    size={10}
                                                />
                                            }
                                        >
                                            Verified
                                        </Badge>
                                    )}
                                </Group>
                            }
                        >
                            <Stack gap="xs">
                                {request.reviewedAt && (
                                    <TimeAgo date={request.reviewedAt} />
                                )}
                                {request.reviewNote && (
                                    <Text fz="sm" className={classes.note}>
                                        {request.reviewNote}
                                    </Text>
                                )}
                            </Stack>
                        </Timeline.Item>
                    )}
                </Timeline>
            </Stack>
        </Paper>
    );
};

export const ContentReviewRequestDetailView: FC<{
    projectUuid: string;
    request: ContentReviewRequestDetail;
}> = ({ projectUuid, request }) => {
    const { user } = useApp();
    const isPending = request.status === ContentReviewRequestStatus.PENDING;
    const isRequester = user.data?.userUuid === request.requestedBy.userUuid;
    const contentName = request.content?.name ?? 'Deleted content';
    const typeLabel = getContentTypeLabel(request.contentType);
    const isApproved = request.status === ContentReviewRequestStatus.APPROVED;
    const moveTitle = isPending
        ? 'What will move'
        : isApproved
          ? 'What moved'
          : 'Requested move';
    // Null means the request ended without a move
    const moveItems = isPending
        ? request.moveSet
        : isApproved
          ? request.movedContent
          : null;

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group gap="sm" align="flex-start" wrap="nowrap">
                    <IconBox
                        icon={getContentTypeIcon(request.contentType)}
                        color={getContentTypeColor(request.contentType)}
                        boxSize={40}
                        size="xl"
                    />
                    <Stack gap={4}>
                        <Group gap="sm">
                            <Title order={3}>{contentName}</Title>
                            <ContentReviewStatusBadge status={request.status} />
                        </Group>
                        <Group gap="xs">
                            <Text fz="sm" c="dimmed">
                                {typeLabel} requested by
                            </Text>
                            <ContentReviewUserChip user={request.requestedBy} />
                            <Text fz="sm" c="dimmed">
                                ·
                            </Text>
                            <TimeAgo date={request.createdAt} />
                        </Group>
                    </Stack>
                </Group>
                {request.content && (
                    <Button
                        component={Link}
                        to={getContentHref(
                            projectUuid,
                            request.contentType,
                            request.content,
                        )}
                        variant="default"
                        size="xs"
                        leftSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        Open {getContentTypeNoun(request.contentType)}
                    </Button>
                )}
            </Group>

            <Grid gutter="lg">
                <Grid.Col span={{ base: 12, md: 8 }}>
                    <Stack gap="lg">
                        <Paper p="md">
                            <Stack gap="md">
                                <Title order={5}>{moveTitle}</Title>
                                <Group gap="sm" wrap="nowrap">
                                    <SpaceChip
                                        name={
                                            request.sourceSpaceName ??
                                            'Personal space'
                                        }
                                        personal
                                    />
                                    <MantineIcon
                                        icon={IconArrowRight}
                                        color="dimmed"
                                    />
                                    <SpaceChip
                                        name={
                                            request.targetSpaceName ??
                                            'Deleted space'
                                        }
                                    />
                                </Group>
                                {moveItems === null ? (
                                    <Text fz="sm" c="dimmed">
                                        Nothing moved. It stayed in{' '}
                                        {request.sourceSpaceName ??
                                            'the personal space'}
                                        .
                                    </Text>
                                ) : moveItems.length === 0 ? (
                                    <Text fz="sm" c="dimmed">
                                        Nothing
                                    </Text>
                                ) : (
                                    <Stack gap={0} className={classes.list}>
                                        {moveItems.map((item) => (
                                            <ContentReviewItemRow
                                                key={item.contentUuid}
                                                contentType={item.contentType}
                                                name={item.name}
                                            />
                                        ))}
                                    </Stack>
                                )}
                            </Stack>
                        </Paper>

                        <Paper p="md">
                            <Stack gap="sm">
                                <Title order={5}>
                                    Note from {request.requestedBy.firstName}
                                </Title>
                                {request.requestNote ? (
                                    <Text fz="sm" className={classes.note}>
                                        {request.requestNote}
                                    </Text>
                                ) : (
                                    <Text fz="sm" c="dimmed">
                                        No note was added.
                                    </Text>
                                )}
                            </Stack>
                        </Paper>

                        {request.similarContent.length > 0 && (
                            <Paper p="md">
                                <Stack gap="sm">
                                    <Stack gap={2}>
                                        <Title order={5}>
                                            Similar content the requester was
                                            shown
                                        </Title>
                                        <Text fz="xs" c="dimmed">
                                            These already lived in shared spaces
                                            when the request was made.
                                        </Text>
                                    </Stack>
                                    <Stack gap={0} className={classes.list}>
                                        {request.similarContent.map((item) => (
                                            <ContentReviewItemRow
                                                key={item.contentUuid}
                                                contentType={item.contentType}
                                                name={item.name}
                                                meta={`${getContentTypeLabel(item.contentType)} in ${item.spaceName}`}
                                                href={getContentHref(
                                                    projectUuid,
                                                    item.contentType,
                                                    item,
                                                )}
                                                isVerified={item.isVerified}
                                            />
                                        ))}
                                    </Stack>
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Stack gap="lg">
                        {isPending && request.canReview && (
                            <DecisionCard
                                request={request}
                                projectUuid={projectUuid}
                            />
                        )}
                        {isPending && isRequester && !request.canReview && (
                            <WaitingCard
                                request={request}
                                projectUuid={projectUuid}
                            />
                        )}
                        <ActivityCard request={request} />
                    </Stack>
                </Grid.Col>
            </Grid>
        </Stack>
    );
};

const ContentReviewRequestPage: FC = () => {
    const projectUuid = useProjectUuid();
    const { requestUuid } = useParams<{ requestUuid: string }>();
    const {
        data: request,
        isInitialLoading,
        error,
    } = useContentReviewRequest(projectUuid ?? '', requestUuid);

    if (!projectUuid) return null;

    return (
        <Page
            title="Review request"
            withCenteredContent
            withXLargePaddedContent
        >
            <Stack gap="lg">
                <PageBreadcrumbs
                    items={[
                        {
                            title: 'Review requests',
                            to: getContentReviewRequestsPath(projectUuid),
                        },
                        {
                            title: request?.content?.name ?? 'Request',
                            active: true,
                        },
                    ]}
                />
                {isInitialLoading && <EmptyStateLoader />}
                {error && (
                    <SettingsEmptyState
                        icon={IconAlertCircle}
                        title="Request not available"
                        description={error.error.message}
                    />
                )}
                {request && (
                    <ContentReviewRequestDetailView
                        key={`${request.uuid}-${request.status}`}
                        projectUuid={projectUuid}
                        request={request}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default ContentReviewRequestPage;
