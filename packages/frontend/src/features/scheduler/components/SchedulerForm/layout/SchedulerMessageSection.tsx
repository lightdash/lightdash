import { Stack, Switch, Text } from '@mantine-8/core';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { type FC } from 'react';
import { useSchedulerFormContext } from '../schedulerFormContext';

export const SchedulerMessageSection: FC = () => {
    const form = useSchedulerFormContext();
    const isAiMessage = form.values.aiAugmentation !== null;

    return (
        <Stack gap="lg">
            <Switch
                label="Include links back to Lightdash"
                description="Recipients can jump straight to the live content. Turn off when recipients don't have Lightdash access."
                checked={form.values.includeLinks}
                onChange={() =>
                    form.setFieldValue(
                        'includeLinks',
                        !form.values?.includeLinks,
                    )
                }
            />

            <Stack gap="xs">
                <Text fw={600} fz="sm">
                    Message body
                </Text>
                {isAiMessage && (
                    <Text fz="xs" c="ldGray.6">
                        AI writes the message on every send; this text is only
                        used if AI generation fails.
                    </Text>
                )}
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
                />
            </Stack>
        </Stack>
    );
};
