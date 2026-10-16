import { type DashboardMarkdownTileProperties } from '@lightdash/common';
import { Group, Stack, Switch, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import MDEditor from '@uiw/react-md-editor';
import { useTranslation } from 'react-i18next';

interface MarkdownTileFormProps {
    form: UseFormReturnType<DashboardMarkdownTileProperties['properties']>;
}

const MarkdownTileForm = ({ form }: MarkdownTileFormProps) => {
    const { t } = useTranslation('dashboard');
    return (
        <Stack gap="md">
            <TextInput
                label={t('tileForms.title')}
                placeholder={t('tileForms.titlePlaceholder')}
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
            <Switch
                label={<Group gap="xs">{t('tileForms.showTileFrame')}</Group>}
                checked={!form.values.hideFrame}
                onChange={(e) =>
                    form.setFieldValue('hideFrame', !e.currentTarget.checked)
                }
            />
        </Stack>
    );
};

export default MarkdownTileForm;
