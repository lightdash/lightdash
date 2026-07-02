import { Group, Stack, Switch, Text, Tooltip } from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { SchedulerFormAiInput } from './SchedulerFormAiInput';
import { useSchedulerFormContext } from './schedulerFormContext';

type Props = {
    projectUuid: string | undefined;
    canUseAiSummary: boolean;
};

export const SchedulerFormCustomizationTab: FC<Props> = ({
    projectUuid,
    canUseAiSummary,
}) => {
    const form = useSchedulerFormContext();
    const isAiMessage = form.values.aiAugmentation !== null;
    return (
        <Stack p="md" gap="lg">
            {canUseAiSummary && (
                <SchedulerFormAiInput projectUuid={projectUuid} />
            )}

            <Stack gap="xs">
                <Text fw={600} fz="sm">
                    Delivery message body
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

            <Group gap="two">
                <Switch
                    label="Include links to Lightdash"
                    checked={form.values.includeLinks}
                    onChange={() =>
                        form.setFieldValue(
                            'includeLinks',
                            !form.values?.includeLinks,
                        )
                    }
                />
                <Tooltip
                    label={`Include links to the shared content in your Lightdash project. We recommend turning this off if you're sharing with users who do not have access to your Lightdash project`}
                    multiline
                    withinPortal
                    position="right"
                    maw={400}
                >
                    <MantineIcon icon={IconInfoCircle} color="ldGray.6" />
                </Tooltip>
            </Group>
        </Stack>
    );
};
