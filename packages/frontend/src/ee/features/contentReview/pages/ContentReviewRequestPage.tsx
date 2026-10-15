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
import { Trans, useTranslation } from 'react-i18next';
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
    getSimilarityMatchLabel,
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
    const { t } = useTranslation('eeMisc');
    const [note, setNote] = useState('');
    const canConfirm = note.trim().length > 0;
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('contentReview.reject.title')}
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
                    {t('contentReview.reject.confirm')}
                </Button>
            }
        >
            <Textarea
                label={t('contentReview.reject.noteLabel')}
                description={t('contentReview.reject.noteDescription')}
                placeholder={t('contentReview.reject.notePlaceholder')}
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
    const { t } = useTranslation('eeMisc');
    const [verify, setVerify] = useState(
        request.verifyByDefault && request.canVerify,
    );
    const [isRejectOpen, rejectHandlers] = useDisclosure(false);
    const { mutateAsync: approve, isLoading: isApproving } =
        useApproveContentReviewRequest(projectUuid);
    const { mutateAsync: reject, isLoading: isRejecting } =
        useRejectContentReviewRequest(projectUuid);
    const itemCount = request.moveSet.length;
    const target = request.targetSpaceName ?? t('contentReview.theTargetSpace');
    const noun = getContentTypeNoun(request.contentType);
    const what =
        itemCount === 1
            ? t('contentReview.decision.thisNoun', { noun })
            : t('contentReview.decision.theseItems', { count: itemCount });
    const requester = request.requestedBy.firstName;

    return (
        <Paper p="md">
            <Stack gap="md">
                <Stack gap={4}>
                    <Title order={5}>{t('contentReview.decision.title')}</Title>
                    <Text fz="sm" c="dimmed">
                        {t('contentReview.decision.access', { what, noun })}
                    </Text>
                </Stack>
                <Stack gap={4}>
                    <Text fz="sm">
                        <Trans
                            t={t}
                            i18nKey="contentReview.decision.approveExplain"
                            values={{ what, target }}
                            components={{ bold: <Text span fw={500} /> }}
                        />
                    </Text>
                    <Text fz="sm">
                        <Trans
                            t={t}
                            i18nKey="contentReview.decision.rejectExplain"
                            values={{ requester }}
                            components={{ bold: <Text span fw={500} /> }}
                        />
                    </Text>
                </Stack>
                <Tooltip
                    label={
                        request.contentType ===
                        ContentReviewContentType.SQL_CHART
                            ? t('contentReview.decision.sqlCannotVerify')
                            : t('contentReview.decision.noVerifyPermission')
                    }
                    disabled={request.canVerify}
                    withArrow
                >
                    <Checkbox
                        label={t('contentReview.decision.verifyOnApprove')}
                        description={t(
                            'contentReview.decision.verifyOnApproveDescription',
                        )}
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
                        {t('contentReview.decision.approveAndMove')}
                    </Button>
                    <Button
                        variant="default"
                        color="red"
                        onClick={rejectHandlers.open}
                        disabled={isApproving}
                    >
                        {t('contentReview.reject.confirm')}
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
    const { t } = useTranslation('eeMisc');
    const { mutate: cancel, isLoading: isCancelling } =
        useCancelContentReviewRequest(projectUuid);
    return (
        <Paper p="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4}>
                    <Title order={5}>{t('contentReview.waiting.title')}</Title>
                    <Text fz="sm" c="dimmed">
                        {t('contentReview.waiting.description', {
                            space:
                                request.targetSpaceName ??
                                t('contentReview.theTargetSpace'),
                        })}
                    </Text>
                </Stack>
                <Button
                    variant="default"
                    loading={isCancelling}
                    onClick={() => cancel(request.uuid)}
                    flex="0 0 auto"
                >
                    {t('contentReview.cancelRequest')}
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
    const { t } = useTranslation('eeMisc');
    const owner = isRequester
        ? t('contentReview.route.yourSpace')
        : t('contentReview.route.userSpace', {
              name: request.requestedBy.firstName,
          });
    const typeLabel = getContentTypeLabel(request.contentType);
    const target =
        request.targetSpaceName ?? t('contentReview.route.deletedSpace');
    switch (request.status) {
        case ContentReviewRequestStatus.PENDING:
            return (
                <Group gap={6} wrap="nowrap">
                    <Text fz="sm" c="dimmed">
                        {t('contentReview.route.typeIn', {
                            type: typeLabel,
                            owner,
                        })}
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
                    {t('contentReview.route.moved', {
                        type: typeLabel,
                        target,
                        owner,
                    })}
                </Text>
            );
        case ContentReviewRequestStatus.REJECTED:
        case ContentReviewRequestStatus.CANCELLED:
            return (
                <Text fz="sm" c="dimmed">
                    {t('contentReview.route.notMoved', {
                        type: typeLabel,
                        owner,
                    })}
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
    const { t } = useTranslation('eeMisc');
    const [dismissed, setDismissed] = useLocalStorage(
        `content-review-first-review-dismissed-${userUuid}`,
        false,
    );
    if (dismissed) return null;
    return (
        <Callout
            variant="info"
            icon={<MantineIcon icon={IconEye} />}
            title={t('contentReview.firstReview.title')}
            withCloseButton
            onClose={() => setDismissed(true)}
        >
            {t('contentReview.firstReview.description')}
        </Callout>
    );
};

// What the requester should do now that the request is decided
const RequesterNextStep: FC<{ request: ContentReviewRequestDetail }> = ({
    request,
}) => {
    const { t } = useTranslation('eeMisc');
    const noun = getContentTypeNoun(request.contentType);
    switch (request.status) {
        case ContentReviewRequestStatus.APPROVED:
            return (
                <Paper p="md">
                    <Stack gap={4}>
                        <Title order={5}>
                            {t('contentReview.nextStep.liveTitle', {
                                noun,
                                space:
                                    request.targetSpaceName ??
                                    t('contentReview.nextStep.theSharedSpace'),
                            })}
                        </Title>
                        <Text fz="sm" c="dimmed">
                            {t('contentReview.nextStep.liveDescription')}
                        </Text>
                    </Stack>
                </Paper>
            );
        case ContentReviewRequestStatus.REJECTED:
            return (
                <Paper p="md">
                    <Stack gap={4}>
                        <Title order={5}>
                            {t('contentReview.nextStep.whatNext')}
                        </Title>
                        <Text fz="sm" c="dimmed">
                            {t('contentReview.nextStep.rejectedDescription', {
                                noun,
                            })}
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
            <Stack gap="sm" flex={1}>
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

const RequestMessage: FC<{
    request: ContentReviewRequestDetail;
    extraItems: ContentReviewMovedItem[];
    isPending: boolean;
    isRequester: boolean;
    projectUuid: string;
}> = ({ request, extraItems, isPending, isRequester, projectUuid }) => {
    const { t } = useTranslation('eeMisc');
    const noun = getContentTypeNoun(request.contentType);
    const target =
        request.targetSpaceName ?? t('contentReview.route.deletedSpace');
    const extrasCount = extraItems.every((item) =>
        isChartType(item.contentType),
    )
        ? t('contentReview.count.charts', { count: extraItems.length })
        : t('contentReview.count.items', { count: extraItems.length });
    const action =
        extraItems.length > 0
            ? t('contentReview.thread.askedWithExtras', {
                  noun,
                  extras: extrasCount,
                  target,
              })
            : t('contentReview.thread.asked', { noun, target });

    return (
        <ThreadMessage
            user={request.requestedBy}
            action={action}
            date={request.createdAt}
        >
            {request.requestNote && (
                <Text fz="sm" className={classes.noteText}>
                    {request.requestNote}
                </Text>
            )}
            {extraItems.length > 0 && (
                <Stack gap={4}>
                    <Text fz="xs" fw={500} c="dimmed">
                        {isPending
                            ? t('contentReview.thread.alsoMoves', {
                                  extras: extrasCount,
                              })
                            : t('contentReview.thread.alsoMoved', {
                                  extras: extrasCount,
                              })}
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
    const { t } = useTranslation('eeMisc');
    if (request.reviewedAt === null) return null;
    const note = request.reviewNote && (
        <Text fz="sm" className={classes.noteText}>
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
                    action={t('contentReview.thread.cancelled')}
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
                                ? t('contentReview.thread.approved')
                                : t('contentReview.thread.rejected')}
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
                                    {t('contentReview.verified')}
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
    const { t } = useTranslation('eeMisc');
    const [opened, { toggle }] = useDisclosure(false);
    const items = request.similarContent;
    if (items.length === 0) return null;
    const allCharts = items.every((item) => isChartType(item.contentType));
    const verifiedCount = items.filter((item) => item.isVerified).length;
    const isPending = request.status === ContentReviewRequestStatus.PENDING;
    const hint = isRequester
        ? t('contentReview.similarFooter.hintRequester')
        : isPending
          ? t('contentReview.similarFooter.hintReviewer', {
                name: request.requestedBy.firstName,
            })
          : t('contentReview.similarFooter.hintPast');
    const verifiedHint =
        verifiedCount > 0
            ? t('contentReview.similarFooter.verified', {
                  count: verifiedCount,
              })
            : '';
    return (
        <Stack gap="xs" className={classes.footer}>
            <Group gap={6} wrap="nowrap">
                <MantineIcon icon={IconCopy} color="dimmed" size="sm" />
                <Text fz="xs" c="dimmed">
                    {allCharts
                        ? t('contentReview.similarFooter.chartsInShared', {
                              count: items.length,
                          })
                        : t('contentReview.similarFooter.itemsInShared', {
                              count: items.length,
                          })}
                </Text>
                <UnstyledButton
                    onClick={toggle}
                    aria-expanded={opened}
                    className={classes.inlineToggle}
                >
                    {opened
                        ? t('contentReview.similarFooter.hide')
                        : t('contentReview.similarFooter.show')}
                </UnstyledButton>
            </Group>
            <Collapse expanded={opened}>
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
                                meta={t('contentReview.similar.meta', {
                                    match: getSimilarityMatchLabel(
                                        item.matchReason,
                                    ),
                                    space: item.spaceName,
                                })}
                                description={item.explanation}
                                href={getContentHref(
                                    projectUuid,
                                    item.contentType,
                                    item,
                                )}
                                isVerified={item.isVerified}
                                compact={!item.explanation}
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
    const { t } = useTranslation('eeMisc');
    const { user } = useApp();
    const isPending = request.status === ContentReviewRequestStatus.PENDING;
    const isApproved = request.status === ContentReviewRequestStatus.APPROVED;
    const isRequester = user.data?.userUuid === request.requestedBy.userUuid;
    const contentName =
        request.content?.name ?? t('contentReview.deletedContent');
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
                        flex="0 0 auto"
                    >
                        {t('contentReview.openNoun', {
                            noun: getContentTypeNoun(request.contentType),
                        })}
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
                            {t('contentReview.waiting.fromSpace', {
                                space:
                                    request.targetSpaceName ??
                                    t('contentReview.theTargetSpace'),
                            })}
                        </Text>
                    </Group>
                </Paper>
            )}
        </Stack>
    );
};

const ContentReviewRequestPage: FC = () => {
    const { t } = useTranslation('eeMisc');
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
            title={t('contentReview.requestPage.title')}
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
                    {t('contentReview.reviewRequests')}
                </Button>
                {isInitialLoading && <EmptyStateLoader />}
                {error && (
                    <SettingsEmptyState
                        icon={IconAlertCircle}
                        title={t('contentReview.requestPage.notAvailable')}
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
