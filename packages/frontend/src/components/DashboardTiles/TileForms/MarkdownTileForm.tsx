import { type DashboardMarkdownTileProperties } from '@lightdash/common';
import { Group, Stack, Switch, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import MDEditor from '@uiw/react-md-editor';
import { useDashboardUIPreference } from '../../../hooks/dashboard/useDashboardUIPreference';

interface MarkdownTileFormProps {
    form: UseFormReturnType<DashboardMarkdownTileProperties['properties']>;
}

const MarkdownTileForm = ({ form }: MarkdownTileFormProps) => {
    const { isDashboardRedesignEnabled } = useDashboardUIPreference();

    return (
        <Stack spacing="md">
            <TextInput
                label="Title"
                placeholder="Tile title"
                disabled={form.values.hideFrame}
                {...form.getInputProps('title')}
            />

            <MDEditor
                preview="edit"
                maxHeight={300}
                minHeight={100}
                visibleDragbar
                overflow={false}
                {...form.getInputProps('content')}
            />
            {isDashboardRedesignEnabled && (
                <Switch
                    label={<Group spacing="xs">Show tile frame</Group>}
                    checked={!form.values.hideFrame}
                    onChange={(e) =>
                        form.setFieldValue(
                            'hideFrame',
                            !e.currentTarget.checked,
                        )
                    }
                />
            )}
        </Stack>
    );
};

export default MarkdownTileForm;
