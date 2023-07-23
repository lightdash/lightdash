import { DashboardMarkdownTileProperties } from '@lightdash/common';
import { Input, Stack, TextInput } from '@mantine/core';
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
        <Input.Wrapper label="Content">
            <MDEditor
                preview="edit"
                height={400}
                overflow={false}
                style={{ marginTop: '0.25rem' }}
                value={form.values.content}
                onChange={(v) => form.setFieldValue('content', v || '')}
            />
        </Input.Wrapper>
    </Stack>
);

export default MarkdownTileForm;
