import { Group, Stack, Switch, Text, Tooltip } from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSchedulerForm } from './schedulerFormContext';

export const SchedulerFormCustomizationTab = () => {
    const form = useSchedulerForm();
    return (
        <Stack p="md">
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
            <Text fw={600} fz="sm">
                Customize delivery message body
            </Text>

            <MDEditor
                preview="edit"
                commands={[
                    commands.bold,
                    commands.italic,
                    commands.strikethrough,
                    commands.divider,
                    commands.link,
                ]}
                value={form.values.message}
                onChange={(value) => form.setFieldValue('message', value || '')}
            />
        </Stack>
    );
};
