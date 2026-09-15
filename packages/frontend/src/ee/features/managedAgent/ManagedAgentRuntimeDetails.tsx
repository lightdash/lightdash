import { Anchor, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import { type useManagedAgentRuntime } from './hooks/useManagedAgentRuntime';

type Runtime = ReturnType<typeof useManagedAgentRuntime>;

// The configuration error and the cleanup downgrade notice: the parts of the
// runtime details that need attention wherever Autopilot is shown.
export const ManagedAgentRuntimeAlerts: FC<{ runtime: Runtime }> = ({
    runtime,
}) => {
    if (runtime.isError || runtime.data?.error) {
        return (
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
        );
    }
    if (runtime.data?.notice) {
        return <Callout variant="warning">{runtime.data.notice}</Callout>;
    }
    return null;
};

export const ManagedAgentRuntimeDetails: FC<{
    runtime: Runtime;
    canManageAiSettings: boolean;
}> = ({ runtime, canManageAiSettings }) => (
    <Stack gap="xs">
        {runtime.isLoading ? (
            <Text fz="sm" c="dimmed">
                Checking AI configuration…
            </Text>
        ) : (
            <>
                {runtime.data && !runtime.data.error && (
                    <>
                        <Text fz="sm" c="dimmed">
                            Runs on {runtime.data.provider} ·{' '}
                            {runtime.data.model} using{' '}
                            {runtime.data.keySource === 'organization'
                                ? "your organization's AI key."
                                : 'the instance AI key.'}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            Scheduled runs consume tokens on this key. Each run
                            uses the current AI settings.
                        </Text>
                    </>
                )}
                <ManagedAgentRuntimeAlerts runtime={runtime} />
            </>
        )}
        {canManageAiSettings && (
            <Anchor component={Link} to="/generalSettings/ai/general" fz="xs">
                AI settings
            </Anchor>
        )}
    </Stack>
);
