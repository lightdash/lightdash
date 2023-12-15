import { DashboardMarkdownTileProperties } from '@lightdash/common';
import { Stack, TextInput } from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import MDEditor from '@uiw/react-md-editor';

interface MarkdownTileFormProps {
    form: UseFormReturnType<DashboardMarkdownTileProperties['properties']>;
}

const MarkdownTileForm = ({ form }: MarkdownTileFormProps) => (
    <Stack spacing="md">
        <TextInput
            label="Title"
            placeholder="Tile title"
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
    </Stack>
);

export default MarkdownTileForm;
