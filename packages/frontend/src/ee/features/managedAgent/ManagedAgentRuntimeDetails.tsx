import { Anchor, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import { type useManagedAgentRuntime } from './hooks/useManagedAgentRuntime';

export const ManagedAgentRuntimeDetails: FC<{
    runtime: ReturnType<typeof useManagedAgentRuntime>;
    canManageAiSettings: boolean;
}> = ({ runtime, canManageAiSettings }) => (
    <Stack gap="xs">
        {runtime.isLoading ? (
            <Text fz="sm" c="dimmed">
                Checking AI configuration…
            </Text>
        ) : runtime.isError || runtime.data?.error ? (
            <Callout variant="danger" title="AI configuration unavailable">
                {runtime.data?.error ?? 'Could not load the AI configuration.'}{' '}
                <Anchor
                    component="button"
                    fz="sm"
                    onClick={() => void runtime.refetch()}
                >
                    Retry
                </Anchor>
            </Callout>
        ) : runtime.data ? (
            <>
                <Text fz="sm" c="dimmed">
                    Runs on {runtime.data.provider} · {runtime.data.model} using{' '}
                    {runtime.data.keySource === 'organization'
                        ? "your organization's AI key."
                        : 'the instance AI key.'}
                </Text>
                <Text fz="xs" c="dimmed">
                    Scheduled runs consume tokens on this key. Each run uses the
                    current AI settings.
                </Text>
                {runtime.data.notice && (
                    <Callout variant="warning">{runtime.data.notice}</Callout>
                )}
            </>
        ) : null}
        {canManageAiSettings && (
            <Anchor component={Link} to="/generalSettings/ai/general" fz="xs">
                AI settings
            </Anchor>
        )}
    </Stack>
);
