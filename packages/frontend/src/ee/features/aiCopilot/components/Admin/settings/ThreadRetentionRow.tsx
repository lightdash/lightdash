import { type RetentionWindowHours } from '@lightdash/common';
import { Box, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../../../../components/common/Callout';
import MantineModal from '../../../../../../components/common/MantineModal';
import {
    useAiThreadRetentionPreview,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';
import { formatRetentionHours } from '../../../utils/threadRetention';
import { ThreadRetentionSelect } from '../../ThreadRetentionSelect';

export const ThreadRetentionRow = ({
    current,
}: {
    current: RetentionWindowHours;
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();
    // A tightening change is held here until the admin confirms the deletion
    // it will trigger on the next cleanup run.
    const [pendingRetentionHours, setPendingRetentionHours] = useState<
        number | undefined
    >(undefined);
    const previewQuery = useAiThreadRetentionPreview(pendingRetentionHours);

    return (
        <>
            <Group
                justify="space-between"
                wrap="nowrap"
                align="flex-start"
                gap="md"
            >
                <Box maw={620}>
                    <Title order={5} mb={4}>
                        {t('settings.retention.title')}
                    </Title>
                    <Text c="dimmed" fz="xs">
                        {t('settings.retention.description')}
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
                title={t('settings.retention.confirmTitle')}
                icon={IconAlertTriangle}
                role="alertdialog"
                confirmLabel={t('settings.retention.confirmLabel')}
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
                        {t('settings.retention.confirmBody', {
                            window:
                                pendingRetentionHours !== undefined
                                    ? formatRetentionHours(
                                          pendingRetentionHours,
                                      )
                                    : '',
                        })}
                    </Text>
                    {previewQuery.isInitialLoading ? (
                        <Group gap="xs">
                            <Loader size="xs" />
                            <Text fz="sm" c="dimmed">
                                {t('settings.retention.counting')}
                            </Text>
                        </Group>
                    ) : previewQuery.data &&
                      previewQuery.data.threadCount > 0 ? (
                        <Callout
                            variant="danger"
                            title={t('settings.retention.willBeDeleted', {
                                threads: t('settings.retention.threadCount', {
                                    count: previewQuery.data.threadCount,
                                }),
                                agents: t('settings.retention.agentCount', {
                                    count: previewQuery.data.agentCount,
                                }),
                            })}
                        />
                    ) : null}
                </Stack>
            </MantineModal>
        </>
    );
};
