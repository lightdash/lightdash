import {
    ContentReviewRequestStatus,
    getContentReviewRequestsPath,
    type ContentReviewRequestDetail,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Blockquote,
    Button,
    Checkbox,
    Group,
    List,
    Loader,
    Paper,
    Stack,
    Text,
    Textarea,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertCircle, IconArrowRight, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useParams } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import Page from '../../../../components/common/Page/Page';
import PageBreadcrumbs from '../../../../components/common/PageBreadcrumbs';
import { SettingsEmptyState } from '../../../../components/common/Settings/SettingsEmptyState';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import ContentReviewStatusBadge from '../components/ContentReviewStatusBadge';
import {
    useApproveContentReviewRequest,
    useCancelContentReviewRequest,
    useContentReviewRequest,
    useRejectContentReviewRequest,
} from '../hooks/useContentReviewRequests';
import { getContentHref, getContentTypeLabel } from '../utils';

const Timestamp: FC<{ prefix: string; date: Date }> = ({ prefix, date }) => {
    const ago = useTimeAgo(new Date(date));
    return (
        <Text fz="sm" c="ldGray.7">
            {prefix} {ago}
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

export const ContentReviewRequestDetailView: FC<{
    projectUuid: string;
    request: ContentReviewRequestDetail;
}> = ({ projectUuid, request }) => {
    const { user } = useApp();
    const [verify, setVerify] = useState(
        request.verifyByDefault && request.canVerify,
    );
    const [isRejectOpen, rejectHandlers] = useDisclosure(false);
    const { mutateAsync: approve, isLoading: isApproving } =
        useApproveContentReviewRequest(projectUuid);
    const { mutateAsync: reject, isLoading: isRejecting } =
        useRejectContentReviewRequest(projectUuid);
    const { mutate: cancel, isLoading: isCancelling } =
        useCancelContentReviewRequest(projectUuid);

    const isPending = request.status === ContentReviewRequestStatus.PENDING;
    const isRequester = user.data?.userUuid === request.requestedBy.userUuid;
    const contentName = request.content?.name ?? 'Deleted content';

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
                <Stack gap="xs">
                    <Group gap="sm">
                        <Title order={3}>{contentName}</Title>
                        <Badge variant="light" color="blue">
                            {getContentTypeLabel(request.contentType)}
                        </Badge>
                        <ContentReviewStatusBadge status={request.status} />
                    </Group>
                    <Group gap="xs">
                        <Text fz="sm" c="ldGray.7">
                            {request.requestedBy.firstName}{' '}
                            {request.requestedBy.lastName} asked to move this
                            from{' '}
                            {request.sourceSpaceName ?? 'their personal space'}
                        </Text>
                        <MantineIcon icon={IconArrowRight} size="sm" />
                        <Text fz="sm" fw={500}>
                            {request.targetSpaceName ?? 'a deleted space'}
                        </Text>
                    </Group>
                    <Timestamp prefix="Requested" date={request.createdAt} />
                </Stack>
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
                    >
                        Open{' '}
                        {getContentTypeLabel(request.contentType).toLowerCase()}
                    </Button>
                )}
            </Group>

            {request.requestNote && (
                <Blockquote fz="sm" p="sm">
                    {request.requestNote}
                </Blockquote>
            )}

            <Paper withBorder p="md">
                <Stack gap="xs">
                    <Text fz="sm" fw={600}>
                        {isPending ? 'What will move' : 'What moved'}
                    </Text>
                    {request.moveSet.length === 0 ? (
                        <Text fz="sm" c="ldGray.6">
                            Nothing
                        </Text>
                    ) : (
                        <List fz="sm" spacing={4}>
                            {request.moveSet.map((item) => (
                                <List.Item key={item.contentUuid}>
                                    {item.name}{' '}
                                    <Text component="span" c="ldGray.6" fz="xs">
                                        (
                                        {getContentTypeLabel(
                                            item.contentType,
                                        ).toLowerCase()}
                                        )
                                    </Text>
                                </List.Item>
                            ))}
                        </List>
                    )}
                </Stack>
            </Paper>

            {request.similarContent.length > 0 && (
                <Paper withBorder p="md">
                    <Stack gap="xs">
                        <Text fz="sm" fw={600}>
                            Similar content the requester was shown
                        </Text>
                        <List fz="sm" spacing={4}>
                            {request.similarContent.map((item) => (
                                <List.Item key={item.contentUuid}>
                                    {item.name}{' '}
                                    <Text component="span" c="ldGray.6" fz="xs">
                                        in {item.spaceName}
                                        {item.isVerified ? ', verified' : ''}
                                    </Text>
                                </List.Item>
                            ))}
                        </List>
                    </Stack>
                </Paper>
            )}

            {!isPending && request.reviewedBy && request.reviewedAt && (
                <Paper withBorder p="md">
                    <Stack gap="xs">
                        <Text fz="sm">
                            {request.status ===
                            ContentReviewRequestStatus.APPROVED
                                ? 'Approved'
                                : 'Rejected'}{' '}
                            by {request.reviewedBy.firstName}{' '}
                            {request.reviewedBy.lastName}
                            {request.verifiedOnApprove ? ', and verified' : ''}
                        </Text>
                        <Timestamp prefix="Decided" date={request.reviewedAt} />
                        {request.reviewNote && (
                            <Blockquote fz="sm" p="sm">
                                {request.reviewNote}
                            </Blockquote>
                        )}
                    </Stack>
                </Paper>
            )}

            {isPending && request.canReview && (
                <Paper withBorder p="md">
                    <Group justify="space-between">
                        <Tooltip
                            label="You need permission to verify content"
                            disabled={request.canVerify}
                            withArrow
                        >
                            <Checkbox
                                label="Verify on approve"
                                checked={verify}
                                disabled={!request.canVerify}
                                onChange={(event) =>
                                    setVerify(event.currentTarget.checked)
                                }
                            />
                        </Tooltip>
                        <Group gap="xs">
                            <Button
                                variant="default"
                                color="red"
                                onClick={rejectHandlers.open}
                                disabled={isApproving}
                            >
                                Reject
                            </Button>
                            <Button
                                loading={isApproving}
                                onClick={() =>
                                    approve({
                                        requestUuid: request.uuid,
                                        body: { verify, note: null },
                                    })
                                }
                            >
                                Approve and move
                            </Button>
                        </Group>
                    </Group>
                </Paper>
            )}

            {isPending && isRequester && !request.canReview && (
                <Group justify="flex-end">
                    <Button
                        variant="default"
                        loading={isCancelling}
                        onClick={() => cancel(request.uuid)}
                    >
                        Cancel request
                    </Button>
                </Group>
            )}

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
            <Stack gap="md">
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
                {isInitialLoading && <Loader size="sm" />}
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
                <Anchor
                    component={Link}
                    to={getContentReviewRequestsPath(projectUuid)}
                    fz="sm"
                >
                    Back to review requests
                </Anchor>
            </Stack>
        </Page>
    );
};

export default ContentReviewRequestPage;
