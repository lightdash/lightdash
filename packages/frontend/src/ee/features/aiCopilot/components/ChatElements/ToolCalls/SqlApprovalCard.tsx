import { type ApiAiAgentSqlApprovalRequest } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Code,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowsDiagonal,
    IconCheck,
    IconShieldCheck,
    IconTerminal2,
    IconX,
    type Icon as IconType,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useSessionStorage } from 'react-use';
import { lightdashApi } from '../../../../../../api';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { markToolCallDecided } from '../../../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreDispatch } from '../../../store/hooks';
import { AiSqlModal } from '../AiSqlModal';
import { getSqlAutoApproveKey, useSqlAutoApprove } from './useSqlAutoApprove';

export type SqlApprovalTarget = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    toolCallId: string;
};

type SqlApprovalCardProps = SqlApprovalTarget & {
    toolArgs: { sql: string; limit?: number };
};

type SubmitState = 'idle' | 'approved' | 'rejected' | 'autoApproved';

type SqlApprovalDecision = ReturnType<typeof useSqlApprovalDecision>;

const useSqlApprovalDecision = ({
    projectUuid,
    agentUuid,
    threadUuid,
    toolCallId,
}: SqlApprovalTarget) => {
    const dispatch = useAiAgentStoreDispatch();
    const [autoApprove, setAutoApprove] = useSessionStorage<boolean>(
        getSqlAutoApproveKey(threadUuid),
        false,
    );
    const [submitting, setSubmitting] = useState<SubmitState>('idle');
    const [error, setError] = useState<string | null>(null);

    const submitDecision = useCallback(
        async (decision: 'approved' | 'rejected', nextState: SubmitState) => {
            setSubmitting(nextState);
            setError(null);
            const body: ApiAiAgentSqlApprovalRequest = { decision };
            try {
                await lightdashApi({
                    url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/tool-calls/${toolCallId}/sql-approval`,
                    method: 'POST',
                    body: JSON.stringify(body),
                });
                dispatch(markToolCallDecided({ threadUuid, toolCallId }));
            } catch (e) {
                setSubmitting('idle');
                setError(e instanceof Error ? e.message : 'Could not submit');
            }
        },
        [projectUuid, agentUuid, threadUuid, toolCallId, dispatch],
    );

    const autoApprovedFired = useRef(false);

    const onApprove = () => submitDecision('approved', 'approved');
    const onReject = () => submitDecision('rejected', 'rejected');
    const onApproveAlways = () => {
        autoApprovedFired.current = true;
        setAutoApprove(true);
        void submitDecision('approved', 'autoApproved');
    };

    useEffect(() => {
        if (autoApprove && !autoApprovedFired.current) {
            autoApprovedFired.current = true;
            void submitDecision('approved', 'autoApproved');
        }
    }, [autoApprove, submitDecision]);

    return {
        autoApprove,
        submitting,
        error,
        onApprove,
        onApproveAlways,
        onReject,
    };
};

/** Enlarged view of the SQL under review, with the same decision handlers as the card. */
export type SqlApprovalReview = {
    opened: boolean;
    onClose: () => void;
    sql: string;
    title: string;
    icon: IconType;
    subtitle: ReactNode | null;
};

type ButtonSize = 'xs' | 'compact-xs' | 'sm';

const ICON_SIZES: Record<ButtonSize, number> = {
    'compact-xs': 11,
    xs: 12,
    sm: 14,
};

const SqlApprovalButtons: FC<{
    decision: SqlApprovalDecision;
    size: ButtonSize;
    placement: 'card' | 'modal';
    onDecide: () => void;
}> = ({ decision, size, placement, onDecide }) => {
    const { submitting } = decision;
    const iconSize = ICON_SIZES[size];
    const decide = (handler: () => void) => () => {
        handler();
        onDecide();
    };

    const approve = (
        <Button
            key="approve"
            size={size}
            color="indigo"
            leftSection={<MantineIcon icon={IconCheck} size={iconSize} />}
            loading={submitting === 'approved'}
            disabled={submitting !== 'idle'}
            onClick={decide(decision.onApprove)}
        >
            Approve
        </Button>
    );
    const approveAlways = (
        <Button
            key="approve-always"
            size={size}
            variant="light"
            color="indigo"
            leftSection={<MantineIcon icon={IconShieldCheck} size={iconSize} />}
            loading={submitting === 'autoApproved'}
            disabled={submitting !== 'idle'}
            onClick={decide(decision.onApproveAlways)}
        >
            Approve & don't ask again this thread
        </Button>
    );
    const reject = (
        <Button
            key="reject"
            size={size}
            variant="default"
            leftSection={<MantineIcon icon={IconX} size={iconSize} />}
            loading={submitting === 'rejected'}
            disabled={submitting !== 'idle'}
            onClick={decide(decision.onReject)}
        >
            Reject
        </Button>
    );

    // Modal footers end with the primary action.
    return placement === 'modal'
        ? [reject, approveAlways, approve]
        : [approve, approveAlways, reject];
};

const noop = () => undefined;

export const SqlExpandButton: FC<{ onClick: () => void }> = ({ onClick }) => (
    <Tooltip label="Expand SQL">
        <ActionIcon size="sm" aria-label="Expand SQL" onClick={onClick}>
            <MantineIcon icon={IconArrowsDiagonal} size={14} />
        </ActionIcon>
    </Tooltip>
);

type SqlApprovalActionsProps = SqlApprovalTarget & {
    size?: 'xs' | 'compact-xs';
    review: SqlApprovalReview | null;
};

/** Approve / approve-always / reject buttons; hides once the thread auto-approves. */
export const SqlApprovalActions: FC<SqlApprovalActionsProps> = ({
    size = 'compact-xs',
    review,
    ...target
}) => {
    const decision = useSqlApprovalDecision(target);

    if (decision.autoApprove) {
        return null;
    }

    return (
        <Stack gap={6}>
            {decision.error ? (
                <Text size="xs" c="red.6">
                    {decision.error}
                </Text>
            ) : null}
            <Group gap={6}>
                <SqlApprovalButtons
                    decision={decision}
                    size={size}
                    placement="card"
                    onDecide={noop}
                />
            </Group>
            {review ? (
                <AiSqlModal
                    opened={review.opened}
                    onClose={review.onClose}
                    sql={review.sql}
                    title={review.title}
                    icon={review.icon}
                    subtitle={review.subtitle}
                    copyPlacement="inline"
                    footer={
                        <Group justify="flex-end" gap="sm">
                            <SqlApprovalButtons
                                decision={decision}
                                size="sm"
                                placement="modal"
                                onDecide={review.onClose}
                            />
                        </Group>
                    }
                />
            ) : null}
        </Stack>
    );
};

export const SqlApprovalCard: FC<SqlApprovalCardProps> = ({
    toolArgs,
    ...target
}) => {
    const autoApprove = useSqlAutoApprove(target.threadUuid);
    const [reviewOpened, { open: openReview, close: closeReview }] =
        useDisclosure(false);

    // Keep the actions mounted: they send the approval for this call.
    if (autoApprove) {
        return <SqlApprovalActions {...target} review={null} />;
    }

    return (
        <Paper
            radius="sm"
            p="sm"
            style={{
                borderColor: 'var(--mantine-color-ldGray-3)',
                background: 'var(--mantine-color-body)',
            }}
        >
            <Stack gap="xs">
                <Group gap="xs" align="center" wrap="nowrap">
                    <MantineIcon
                        icon={IconTerminal2}
                        size={14}
                        color="indigo.5"
                    />
                    <Text size="xs" fw={500} c="ldGray.8" flex={1}>
                        About to run SQL — approve to execute
                    </Text>
                    <SqlExpandButton onClick={openReview} />
                </Group>
                <Code
                    block
                    style={{
                        fontSize: 11,
                        maxHeight: 240,
                        overflow: 'auto',
                    }}
                >
                    {toolArgs.sql}
                </Code>
                <SqlApprovalActions
                    size="xs"
                    {...target}
                    review={{
                        opened: reviewOpened,
                        onClose: closeReview,
                        sql: toolArgs.sql,
                        title: 'Run SQL',
                        icon: IconTerminal2,
                        subtitle: 'Review the query, then approve to execute',
                    }}
                />
            </Stack>
        </Paper>
    );
};
