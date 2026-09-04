import {
    assertUnreachable,
    ContentReviewContentType,
    ContentReviewRequestStatus,
    getContentReviewRequestsPath,
    type ContentReviewMovedItem,
    type ContentReviewRequestDetail,
    type ContentReviewUser,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Checkbox,
    Collapse,
    Group,
    Paper,
    Stack,
    Text,
    Textarea,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconArrowLeft,
    IconArrowRight,
    IconCheck,
    IconCopy,
    IconCircleCheckFilled,
    IconClockHour4,
    IconEye,
    IconExternalLink,
    IconX,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import {
    useState,
    type FC,
    type PropsWithChildren,
    type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router';
import { useLocalStorage } from 'react-use';
import { LightdashUserAvatar } from '../../../../components/Avatar';
import Callout from '../../../../components/common/Callout';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import Page from '../../../../components/common/Page/Page';
import { IconBox } from '../../../../components/common/ResourceIcon';
import { SettingsEmptyState } from '../../../../components/common/Settings/SettingsEmptyState';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import ContentReviewItemRow from '../components/ContentReviewItemRow';
import ContentReviewStatusBadge from '../components/ContentReviewStatusBadge';
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
    getUserInitials,
} from '../utils';
import classes from './ContentReviewRequestPage.module.css';

const TimeAgo: FC<{ date: Date }> = ({ date }) => {
    const parsed = new Date(date);
    const ago = useTimeAgo(parsed);
    return (
        <Tooltip label={format(parsed, 'PPpp')} withArrow>
            <Text fz="xs" c="dimmed">
                {ago}
            </Text>
        </Tooltip>
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
                placeholder="Duplicate of Orders in June in Jaffle shop, use that one instead"
                autosize
                minRows={3}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                data-autofocus
            />
        </MantineModal>
    );
};

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
    const noun = getContentTypeNoun(request.contentType);
    const what = itemCount === 1 ? `this ${noun}` : `these ${itemCount} items`;
    const requester = request.requestedBy.firstName;

    return (
        <Paper p="md">
            <Stack gap="md">
                <Stack gap={4}>
                    <Title order={5}>Your decision</Title>
                    <Text fz="sm" c="dimmed">
                        You have temporary access to {what} so you can check it.
                        Open the {noun}, check the numbers and the name, then
                        decide.
                    </Text>
                </Stack>
                <Stack gap={4}>
                    <Text fz="sm">
                        <Text span fw={500}>
                            Approve
                        </Text>{' '}
                        moves {what} into {target}, where everyone with access
                        to that space can find it.
                    </Text>
                    <Text fz="sm">
                        <Text span fw={500}>
                            Reject
                        </Text>{' '}
                        keeps it in {requester}&apos;s personal space. They see
                        your note and can ask again after changes.
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
                        description="Adds a verified badge and ranks it first for Ask AI and search"
                        checked={verify}
                        disabled={!request.canVerify}
                        onChange={(event) =>
                            setVerify(event.currentTarget.checked)
                        }
                    />
                </Tooltip>
                <Group gap="xs">
                    <Button
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
                        variant="default"
                        color="red"
                        onClick={rejectHandlers.open}
                        disabled={isApproving}
                    >
                        Reject
                    </Button>
                </Group>
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
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4}>
                    <Title order={5}>Waiting for a reviewer</Title>
                    <Text fz="sm" c="dimmed">
                        Reviewers for{' '}
                        {request.targetSpaceName ?? 'the target space'} were
                        notified and will see your note. You can cancel the
                        request at any time.
                    </Text>
                </Stack>
                <Button
                    variant="default"
                    loading={isCancelling}
                    onClick={() => cancel(request.uuid)}
                    className="ld-shrink-0"
                >
                    Cancel request
                </Button>
            </Group>
        </Paper>
    );
};

// The route this request is about, shown once under the title
const MoveRoute: FC<{
    request: ContentReviewRequestDetail;
    isRequester: boolean;
}> = ({ request, isRequester }) => {
    const owner = isRequester
        ? 'your personal space'
        : `${request.requestedBy.firstName}'s personal space`;
    const typeLabel = getContentTypeLabel(request.contentType);
    const target = request.targetSpaceName ?? 'a deleted space';
    switch (request.status) {
        case ContentReviewRequestStatus.PENDING:
            return (
                <Group gap={6} wrap="nowrap">
                    <Text fz="sm" c="dimmed">
                        {typeLabel} in {owner}
                    </Text>
                    <MantineIcon
                        icon={IconArrowRight}
                        color="dimmed"
                        size="sm"
                    />
                    <Text fz="sm" c="dimmed">
                        {target}
                    </Text>
                </Group>
            );
        case ContentReviewRequestStatus.APPROVED:
            return (
                <Text fz="sm" c="dimmed">
                    {typeLabel} in {target}, moved from {owner}
                </Text>
            );
        case ContentReviewRequestStatus.REJECTED:
        case ContentReviewRequestStatus.CANCELLED:
            return (
                <Text fz="sm" c="dimmed">
                    {typeLabel} in {owner}, not moved
                </Text>
            );
        default:
            return assertUnreachable(
                request.status,
                'Unknown review request status',
            );
    }
};

// Shown once per user, the first time they land on a request they can review
const FirstReviewCallout: FC<{ userUuid: string }> = ({ userUuid }) => {
    const [dismissed, setDismissed] = useLocalStorage(
        `content-review-first-review-dismissed-${userUuid}`,
        false,
    );
    if (dismissed) return null;
    return (
        <Callout
            variant="info"
            icon={<MantineIcon icon={IconEye} />}
            title="You are reviewing a request"
            withCloseButton
            onClose={() => setDismissed(true)}
        >
            Editors build charts and dashboards in their own space and ask to
            move them into a shared space. You decide whether this one is ready
            for everyone.
        </Callout>
    );
};

// What the requester should do now that the request is decided
const RequesterNextStep: FC<{ request: ContentReviewRequestDetail }> = ({
    request,
}) => {
    const noun = getContentTypeNoun(request.contentType);
    switch (request.status) {
        case ContentReviewRequestStatus.APPROVED:
            return (
                <Paper p="md">
                    <Stack gap={4}>
                        <Title order={5}>
                            Your {noun} is live in{' '}
                            {request.targetSpaceName ?? 'the shared space'}
                        </Title>
                        <Text fz="sm" c="dimmed">
                            Everyone with access to that space can find it now.
                            Edits from here on follow that space&apos;s
                            permissions.
                        </Text>
                    </Stack>
                </Paper>
            );
        case ContentReviewRequestStatus.REJECTED:
            return (
                <Paper p="md">
                    <Stack gap={4}>
                        <Title order={5}>What next</Title>
                        <Text fz="sm" c="dimmed">
                            The note above says what to change. Open the {noun},
                            edit it, then request a review again from its menu.
                        </Text>
                    </Stack>
                </Paper>
            );
        case ContentReviewRequestStatus.PENDING:
        case ContentReviewRequestStatus.CANCELLED:
            return null;
        default:
            return assertUnreachable(
                request.status,
                'Unknown review request status',
            );
    }
};

// One entry in the request thread: who did what, when, and anything they said
const ThreadMessage: FC<
    PropsWithChildren<{
        user: ContentReviewUser;
        action: ReactNode;
        date: Date;
    }>
> = ({ user, action, date, children }) => (
    <Paper p="md">
        <Group gap="sm" align="flex-start" wrap="nowrap">
            <LightdashUserAvatar size={28} userUuid={user.userUuid} fz="xs">
                {getUserInitials(user)}
            </LightdashUserAvatar>
            <Stack gap="sm" className="ld-grow">
                <Group gap={6} wrap="wrap">
                    <Text fz="sm" fw={500}>
                        {getUserFullName(user)}
                    </Text>
                    <Text fz="sm" c="dimmed">
                        {action}
                    </Text>
                    <Text fz="sm" c="dimmed">
                        ·
                    </Text>
                    <TimeAgo date={date} />
                </Group>
                {children}
            </Stack>
        </Group>
    </Paper>
);

const isChartType = (contentType: ContentReviewContentType): boolean =>
    contentType === ContentReviewContentType.CHART ||
    contentType === ContentReviewContentType.SQL_CHART;

const pluralise = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

const RequestMessage: FC<{
    request: ContentReviewRequestDetail;
    extraItems: ContentReviewMovedItem[];
    isPending: boolean;
    isRequester: boolean;
    projectUuid: string;
}> = ({ request, extraItems, isPending, isRequester, projectUuid }) => {
    const noun = getContentTypeNoun(request.contentType);
    const target = request.targetSpaceName ?? 'a deleted space';
    const extrasNoun = extraItems.every((item) => isChartType(item.contentType))
        ? 'chart'
        : 'item';
    const extrasCount = pluralise(extraItems.length, extrasNoun);
    const action =
        extraItems.length > 0
            ? `asked to move this ${noun} and ${extrasCount} it uses into ${target}`
            : `asked to move this ${noun} into ${target}`;

    return (
        <ThreadMessage
            user={request.requestedBy}
            action={action}
            date={request.createdAt}
        >
            {request.requestNote && (
                <Text fz="sm" className="ld-pre-wrap">
                    {request.requestNote}
                </Text>
            )}
            {extraItems.length > 0 && (
                <Stack gap={4}>
                    <Text fz="xs" fw={500} c="dimmed">
                        {isPending ? 'Also moves' : 'Also moved'} {extrasCount}
                    </Text>
                    <Stack gap={0} className={classes.list}>
                        {extraItems.map((item) => (
                            <ContentReviewItemRow
                                key={item.contentUuid}
                                contentType={item.contentType}
                                name={item.name}
                                compact
                            />
                        ))}
                    </Stack>
                </Stack>
            )}
            <SimilarContentFooter
                request={request}
                projectUuid={projectUuid}
                isRequester={isRequester}
            />
        </ThreadMessage>
    );
};

const OutcomeMessage: FC<{ request: ContentReviewRequestDetail }> = ({
    request,
}) => {
    if (request.reviewedAt === null) return null;
    const note = request.reviewNote && (
        <Text fz="sm" className="ld-pre-wrap">
            {request.reviewNote}
        </Text>
    );
    switch (request.status) {
        case ContentReviewRequestStatus.PENDING:
            return null;
        case ContentReviewRequestStatus.CANCELLED:
            return (
                <ThreadMessage
                    user={request.requestedBy}
                    action="cancelled this request"
                    date={request.reviewedAt}
                >
                    {note}
                </ThreadMessage>
            );
        case ContentReviewRequestStatus.APPROVED:
        case ContentReviewRequestStatus.REJECTED: {
            if (request.reviewedBy === null) return null;
            const isApproved =
                request.status === ContentReviewRequestStatus.APPROVED;
            return (
                <ThreadMessage
                    user={request.reviewedBy}
                    action={
                        <Group gap={6} wrap="nowrap">
                            <MantineIcon
                                icon={isApproved ? IconCheck : IconX}
                                color={isApproved ? 'green.6' : 'red.6'}
                                size="sm"
                            />
                            {isApproved
                                ? 'approved and moved it'
                                : 'rejected this request'}
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
                    date={request.reviewedAt}
                >
                    {note}
                </ThreadMessage>
            );
        }
        default:
            return assertUnreachable(
                request.status,
                'Unknown review request status',
            );
    }
};

// Lives at the foot of the request message: what the requester was shown
const SimilarContentFooter: FC<{
    request: ContentReviewRequestDetail;
    projectUuid: string;
    isRequester: boolean;
}> = ({ request, projectUuid, isRequester }) => {
    const [opened, { toggle }] = useDisclosure(false);
    const items = request.similarContent;
    if (items.length === 0) return null;
    const noun = items.every((item) => isChartType(item.contentType))
        ? 'chart'
        : 'item';
    const verifiedCount = items.filter((item) => item.isVerified).length;
    const isPending = request.status === ContentReviewRequestStatus.PENDING;
    const hint = isRequester
        ? 'You saw these before submitting.'
        : isPending
          ? `If one of these already answers the question, reject and point ${request.requestedBy.firstName} to it.`
          : 'The requester saw these before submitting.';
    const verifiedHint =
        verifiedCount > 0
            ? ` ${verifiedCount === 1 ? 'One is' : `${verifiedCount} are`} verified.`
            : '';
    return (
        <Stack gap="xs" className={classes.footer}>
            <Group gap={6} wrap="nowrap">
                <MantineIcon icon={IconCopy} color="dimmed" size="sm" />
                <Text fz="xs" c="dimmed">
                    {pluralise(items.length, `similar ${noun}`)} already in
                    shared spaces.
                </Text>
                <UnstyledButton
                    onClick={toggle}
                    aria-expanded={opened}
                    className={classes.inlineToggle}
                >
                    {opened ? 'Hide' : 'Show'}
                </UnstyledButton>
            </Group>
            <Collapse in={opened}>
                <Stack gap={4}>
                    <Text fz="xs" c="dimmed">
                        {hint}
                        {verifiedHint}
                    </Text>
                    <Stack gap={0} className={classes.list}>
                        {items.map((item) => (
                            <ContentReviewItemRow
                                key={item.contentUuid}
                                contentType={item.contentType}
                                name={item.name}
                                meta={`in ${item.spaceName}`}
                                href={getContentHref(
                                    projectUuid,
                                    item.contentType,
                                    item,
                                )}
                                isVerified={item.isVerified}
                                compact
                            />
                        ))}
                    </Stack>
                </Stack>
            </Collapse>
        </Stack>
    );
};

export const ContentReviewRequestDetailView: FC<{
    projectUuid: string;
    request: ContentReviewRequestDetail;
}> = ({ projectUuid, request }) => {
    const { user } = useApp();
    const isPending = request.status === ContentReviewRequestStatus.PENDING;
    const isApproved = request.status === ContentReviewRequestStatus.APPROVED;
    const isRequester = user.data?.userUuid === request.requestedBy.userUuid;
    const contentName = request.content?.name ?? 'Deleted content';
    // Nothing moved on a rejected or cancelled request
    const moveItems = isPending
        ? request.moveSet
        : isApproved
          ? request.movedContent
          : [];
    const extraItems = moveItems.filter(
        (item) => item.contentUuid !== request.contentUuid,
    );
    const showWaitingNotice = isPending && !request.canReview && !isRequester;
    const isReviewing = isPending && request.canReview;

    return (
        <Stack gap="lg">
            {isReviewing && user.data && (
                <FirstReviewCallout userUuid={user.data.userUuid} />
            )}
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
                        <MoveRoute
                            request={request}
                            isRequester={isRequester}
                        />
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
                        variant={isReviewing ? 'filled' : 'default'}
                        size="xs"
                        leftSection={<MantineIcon icon={IconExternalLink} />}
                        className="ld-shrink-0"
                    >
                        Open {getContentTypeNoun(request.contentType)}
                    </Button>
                )}
            </Group>

            <RequestMessage
                request={request}
                extraItems={extraItems}
                isPending={isPending}
                isRequester={isRequester}
                projectUuid={projectUuid}
            />
            <OutcomeMessage request={request} />
            {isRequester && <RequesterNextStep request={request} />}

            {isPending && request.canReview && (
                <DecisionCard request={request} projectUuid={projectUuid} />
            )}
            {isPending && isRequester && !request.canReview && (
                <WaitingCard request={request} projectUuid={projectUuid} />
            )}
            {showWaitingNotice && (
                <Paper variant="dotted" p="md">
                    <Group gap="xs">
                        <MantineIcon icon={IconClockHour4} color="dimmed" />
                        <Text fz="sm" c="dimmed">
                            Waiting for a reviewer from{' '}
                            {request.targetSpaceName ?? 'the target space'}.
                        </Text>
                    </Group>
                </Paper>
            )}
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
            <Stack gap="lg" className={classes.page}>
                <Button
                    component={Link}
                    to={getContentReviewRequestsPath(projectUuid)}
                    variant="subtle"
                    size="xs"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    className={classes.backLink}
                >
                    Review requests
                </Button>
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
