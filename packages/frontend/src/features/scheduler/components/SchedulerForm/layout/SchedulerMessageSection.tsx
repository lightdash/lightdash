import { Group, Stack, Switch, Text } from '@mantine-8/core';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { type FC } from 'react';
import { useSchedulerFormContext } from '../schedulerFormContext';
import classes from './SchedulerDeliveryModal.module.css';

export const SchedulerMessageSection: FC = () => {
    const form = useSchedulerFormContext();
    const isAiMessage = form.values.aiAugmentation !== null;

    return (
        <Stack gap="lg">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2}>
                    <Text fw={500} fz="sm">
                        Include links back to Lightdash
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Recipients get a link to open this in Lightdash. Turn
                        off if they don't have access to your project.
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

            <Stack gap="xs">
                <Stack gap={2}>
                    <span className={classes.subBlockLabel}>Message body</span>
                    <Text fz="xs" c="dimmed">
                        {isAiMessage
                            ? 'AI writes the message on every send; this text is only used if AI generation fails.'
                            : 'Shown at the top of every email and Slack message.'}
                    </Text>
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
