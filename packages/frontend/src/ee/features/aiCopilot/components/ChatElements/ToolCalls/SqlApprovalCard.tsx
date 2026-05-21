import { type ApiAiAgentSqlApprovalRequest } from '@lightdash/common';
import { Button, Code, Group, Paper, Stack, Text } from '@mantine-8/core';
import {
    IconCheck,
    IconShieldCheck,
    IconTerminal2,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useSessionStorage } from 'react-use';
import { lightdashApi } from '../../../../../../api';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { markToolCallDecided } from '../../../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreDispatch } from '../../../store/hooks';

type SqlApprovalCardProps = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    toolCallId: string;
    toolArgs: { sql: string; limit?: number };
};

type SubmitState = 'idle' | 'approved' | 'rejected' | 'autoApproved';

export const SqlApprovalCard: FC<SqlApprovalCardProps> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    toolCallId,
    toolArgs,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const [autoApprove, setAutoApprove] = useSessionStorage<boolean>(
        `sql-auto-approve:${threadUuid}`,
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

    if (autoApprove) {
        return null;
    }

    return (
        <Paper
            withBorder
            radius="sm"
            p="sm"
            shadow="none"
            style={{
                borderColor: 'var(--mantine-color-ldGray-3)',
                background: 'var(--mantine-color-body)',
            }}
        >
            <Stack gap="xs">
                <Group gap="xs" align="center">
                    <MantineIcon
                        icon={IconTerminal2}
                        size={14}
                        color="indigo.5"
                    />
                    <Text size="xs" fw={500} c="ldGray.8">
                        About to run SQL — approve to execute
                    </Text>
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
                {error ? (
                    <Text size="xs" c="red.6">
                        {error}
                    </Text>
                ) : null}
                <Group gap="xs">
                    <Button
                        size="xs"
                        color="indigo"
                        leftSection={<MantineIcon icon={IconCheck} size={12} />}
                        loading={submitting === 'approved'}
                        disabled={submitting !== 'idle'}
                        onClick={onApprove}
                    >
                        Approve
                    </Button>
                    <Button
                        size="xs"
                        variant="light"
                        color="indigo"
                        leftSection={
                            <MantineIcon icon={IconShieldCheck} size={12} />
                        }
                        loading={submitting === 'autoApproved'}
                        disabled={submitting !== 'idle'}
                        onClick={onApproveAlways}
                    >
                        Approve & don't ask again this thread
                    </Button>
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconX} size={12} />}
                        loading={submitting === 'rejected'}
                        disabled={submitting !== 'idle'}
                        onClick={onReject}
                    >
                        Reject
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};
