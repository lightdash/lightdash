import { type RetentionWindowHours } from '@lightdash/common';
import { Box, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import Callout from '../../../../../../components/common/Callout';
import MantineModal from '../../../../../../components/common/MantineModal';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import {
    useAiThreadRetentionPreview,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import { formatRetentionHours } from '../../../utils/threadRetention';
import { ThreadRetentionSelect } from '../../ThreadRetentionSelect';

export const ThreadRetentionCard = ({
    current,
}: {
    current: RetentionWindowHours;
}) => {
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();
    // A tightening change is held here until the admin confirms the deletion
    // it will trigger on the next cleanup run.
    const [pendingRetentionHours, setPendingRetentionHours] = useState<
        number | undefined
    >(undefined);
    const previewQuery = useAiThreadRetentionPreview(pendingRetentionHours);

    return (
        <SettingsCard>
            <Group
                justify="space-between"
                wrap="nowrap"
                align="flex-start"
                gap="md"
            >
                <Box maw={620}>
                    <Title order={5} mb={4}>
                        Conversation retention
                    </Title>
                    <Text c="ldGray.6" fz="xs">
                        Automatically delete agent conversations after a period
                        of inactivity. Agents can shorten this window but not
                        extend it.
                    </Text>
                </Box>
                <ThreadRetentionSelect
                    value={current}
                    disabled={isUpdatingSettings}
                    onChange={(hours) => {
                        const tightens =
                            hours !== null &&
                            (current === null || hours < current);
                        if (tightens) {
                            setPendingRetentionHours(hours);
                        } else {
                            updateSettings({ threadRetentionHours: hours });
                        }
                    }}
                />
            </Group>
            <MantineModal
                opened={pendingRetentionHours !== undefined}
                onClose={() => setPendingRetentionHours(undefined)}
                title="Reduce conversation retention?"
                icon={IconAlertTriangle}
                role="alertdialog"
                confirmLabel="Reduce retention"
                onConfirm={() => {
                    if (pendingRetentionHours !== undefined) {
                        updateSettings({
                            threadRetentionHours: pendingRetentionHours,
                        });
                    }
                    setPendingRetentionHours(undefined);
                }}
            >
                <Stack gap="xs">
                    <Text fz="sm">
                        Conversations inactive for longer than{' '}
                        {pendingRetentionHours !== undefined
                            ? formatRetentionHours(pendingRetentionHours)
                            : ''}{' '}
                        will be permanently deleted across all agents in this
                        organization, starting within the hour. This cannot be
                        undone.
                    </Text>
                    {previewQuery.isInitialLoading ? (
                        <Group gap="xs">
                            <Loader size="xs" />
                            <Text fz="sm" c="dimmed">
                                Counting affected conversations…
                            </Text>
                        </Group>
                    ) : previewQuery.data &&
                      previewQuery.data.threadCount > 0 ? (
                        <Callout
                            variant="danger"
                            title={`${previewQuery.data.threadCount} conversation${
                                previewQuery.data.threadCount === 1 ? '' : 's'
                            } across ${previewQuery.data.agentCount} agent${
                                previewQuery.data.agentCount === 1 ? '' : 's'
                            } will be deleted`}
                        />
                    ) : null}
                </Stack>
            </MantineModal>
        </SettingsCard>
    );
};
