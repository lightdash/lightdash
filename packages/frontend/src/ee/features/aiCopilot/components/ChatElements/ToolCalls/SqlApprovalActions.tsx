import { type ApiAiAgentSqlApprovalRequest } from '@lightdash/common';
import { Button, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconShieldCheck, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useSessionStorage } from 'react-use';
import { lightdashApi } from '../../../../../../api';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { markToolCallDecided } from '../../../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreDispatch } from '../../../store/hooks';

export type SqlApprovalTarget = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    toolCallId: string;
};

/** The thread whose pending SQL approvals a card renders; the call is picked per row. */
export type SqlApprovalThread = Omit<SqlApprovalTarget, 'toolCallId'>;

type SubmitState = 'idle' | 'approved' | 'rejected' | 'autoApproved';

const getAutoApproveKey = (threadUuid: string) =>
    `sql-auto-approve:${threadUuid}`;

const useSqlApprovalDecision = ({
    projectUuid,
    agentUuid,
    threadUuid,
    toolCallId,
}: SqlApprovalTarget) => {
    const dispatch = useAiAgentStoreDispatch();
    const [autoApprove, setAutoApprove] = useSessionStorage<boolean>(
        getAutoApproveKey(threadUuid),
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

type SqlApprovalActionsProps = SqlApprovalTarget & {
    size?: 'xs' | 'compact-xs';
};

/** Approve / approve-always / reject buttons; hides once the thread auto-approves. */
export const SqlApprovalActions: FC<SqlApprovalActionsProps> = ({
    size = 'compact-xs',
    ...target
}) => {
    const {
        autoApprove,
        submitting,
        error,
        onApprove,
        onApproveAlways,
        onReject,
    } = useSqlApprovalDecision(target);
    const iconSize = size === 'xs' ? 12 : 11;

    if (autoApprove) {
        return null;
    }

    return (
        <Stack gap={6}>
            {error ? (
                <Text size="xs" c="red.6">
                    {error}
                </Text>
            ) : null}
            <Group gap={6}>
                <Button
                    size={size}
                    color="indigo"
                    leftSection={
                        <MantineIcon icon={IconCheck} size={iconSize} />
                    }
                    loading={submitting === 'approved'}
                    disabled={submitting !== 'idle'}
                    onClick={onApprove}
                >
                    Approve
                </Button>
                <Button
                    size={size}
                    variant="light"
                    color="indigo"
                    leftSection={
                        <MantineIcon icon={IconShieldCheck} size={iconSize} />
                    }
                    loading={submitting === 'autoApproved'}
                    disabled={submitting !== 'idle'}
                    onClick={onApproveAlways}
                >
                    Approve & don't ask again this thread
                </Button>
                <Button
                    size={size}
                    variant="default"
                    leftSection={<MantineIcon icon={IconX} size={iconSize} />}
                    loading={submitting === 'rejected'}
                    disabled={submitting !== 'idle'}
                    onClick={onReject}
                >
                    Reject
                </Button>
            </Group>
        </Stack>
    );
};
