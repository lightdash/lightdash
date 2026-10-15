import { Anchor, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import { type useManagedAgentRuntime } from './hooks/useManagedAgentRuntime';

type Runtime = ReturnType<typeof useManagedAgentRuntime>;

// The configuration error and the cleanup downgrade notice: the parts of the
// runtime details that need attention wherever Autopilot is shown.
export const ManagedAgentRuntimeAlerts: FC<{ runtime: Runtime }> = ({
    runtime,
}) => {
    const { t } = useTranslation('managedAgent');
    if (runtime.isError || runtime.data?.error) {
        return (
            <Callout variant="danger" title={t('runtime.unavailable')}>
                {runtime.data?.error ?? t('runtime.loadFailed')}{' '}
                <Anchor
                    component="button"
                    fz="sm"
                    onClick={() => void runtime.refetch()}
                >
                    {t('actions.retry', { ns: 'common' })}
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
}> = ({ runtime, canManageAiSettings }) => {
    const { t } = useTranslation('managedAgent');
    return (
        <Stack gap="xs">
            {runtime.isLoading ? (
                <Text fz="sm" c="dimmed">
                    {t('runtime.checking')}
                </Text>
            ) : (
                <>
                    {runtime.data && !runtime.data.error && (
                        <>
                            <Text fz="sm" c="dimmed">
                                {runtime.data.keySource === 'organization'
                                    ? t('runtime.runsOnOrganizationKey', {
                                          provider: runtime.data.provider,
                                          model: runtime.data.model,
                                      })
                                    : t('runtime.runsOnInstanceKey', {
                                          provider: runtime.data.provider,
                                          model: runtime.data.model,
                                      })}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {t('runtime.tokenUsageHint')}
                            </Text>
                        </>
                    )}
                    <ManagedAgentRuntimeAlerts runtime={runtime} />
                </>
            )}
            {canManageAiSettings && (
                <Anchor
                    component={Link}
                    to="/generalSettings/ai/general"
                    fz="xs"
                >
                    {t('runtime.aiSettings')}
                </Anchor>
            )}
        </Stack>
    );
};
