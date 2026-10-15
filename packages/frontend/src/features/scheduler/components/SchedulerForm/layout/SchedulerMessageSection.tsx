import { Box, Group, Stack, Switch, Text, Tooltip } from '@mantine/core';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useSchedulerFormContext } from '../schedulerFormContext';
import classes from './SchedulerDeliveryModal.module.css';

export const SchedulerMessageSection: FC = () => {
    const { t } = useTranslation('scheduler');
    const form = useSchedulerFormContext();
    const isAiMessage = form.values.aiAugmentation !== null;
    const hasEmailTargets = (form.values.emailTargets?.length ?? 0) > 0;

    return (
        <Stack gap="lg">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2}>
                    <Text fw={500} fz="sm">
                        {t('message.includeLink')}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {t('message.includeLinkDescription')}
                    </Text>
                </Stack>
                <Switch
                    checked={form.values.includeLinks}
                    onChange={() =>
                        form.setFieldValue(
                            'includeLinks',
                            !form.values?.includeLinks,
                        )
                    }
                />
            </Group>

            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2}>
                    <Text fw={500} fz="sm">
                        {t('message.plainText')}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {t('message.plainTextDescription')}
                    </Text>
                </Stack>
                <Tooltip
                    label={t('message.plainTextDisabled')}
                    position="top-end"
                    disabled={hasEmailTargets}
                >
                    <Box>
                        <Switch
                            checked={form.values.plainTextEmail}
                            disabled={!hasEmailTargets}
                            onChange={() =>
                                form.setFieldValue(
                                    'plainTextEmail',
                                    !form.values?.plainTextEmail,
                                )
                            }
                        />
                    </Box>
                </Tooltip>
            </Group>

            <Stack gap="xs">
                <Stack gap={2}>
                    <span className={classes.subBlockLabel}>
                        {t('message.body')}
                    </span>
                    {isAiMessage && (
                        <Text fz="xs" c="dimmed">
                            {t('message.aiFallback')}
                        </Text>
                    )}
                </Stack>
                <MDEditor
                    preview="edit"
                    commands={[
                        commands.bold,
                        commands.italic,
                        commands.strikethrough,
                        commands.divider,
                        commands.link,
                    ]}
                    maxHeight={300}
                    minHeight={100}
                    visibleDragbar
                    value={form.values.message}
                    onChange={(value) =>
                        form.setFieldValue('message', value || '')
                    }
                    overflow={false}
                    textareaProps={{
                        placeholder: t('message.placeholder'),
                    }}
                />
            </Stack>
        </Stack>
    );
};
