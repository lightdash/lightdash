import { Box, Group, Stack, Switch, Text, Tooltip } from '@mantine/core';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { type FC } from 'react';
import { useSchedulerFormContext } from '../schedulerFormContext';
import classes from './SchedulerDeliveryModal.module.css';

export const SchedulerMessageSection: FC = () => {
    const form = useSchedulerFormContext();
    const isAiMessage = form.values.aiAugmentation !== null;
    const hasEmailTargets = (form.values.emailTargets?.length ?? 0) > 0;

    return (
        <Stack gap="lg">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2}>
                    <Text fw={500} fz="sm">
                        Include link to Lightdash
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Recipients can open this in Lightdash.
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
                        Send as plain text
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Emails arrive as plain text with the file attached — no
                        Lightdash branding, buttons or footer. Your message
                        below is the whole body. Slack and webhook deliveries
                        are unaffected.
                    </Text>
                </Stack>
                <Tooltip
                    label="You must have at least one email recipient to send as plain text"
                    position="top-end"
                    withinPortal
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
                    <span className={classes.subBlockLabel}>Message body</span>
                    {isAiMessage && (
                        <Text fz="xs" c="dimmed">
                            AI writes the message on every send; this text is
                            only used if AI generation fails.
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
                        placeholder: 'Add a note for recipients...',
                    }}
                />
            </Stack>
        </Stack>
    );
};
