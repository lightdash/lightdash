import { type DashboardHeadingTileProperties } from '@lightdash/common';
import { Stack, Switch, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { useTranslation } from 'react-i18next';

interface HeadingTileFormProps {
    form: UseFormReturnType<DashboardHeadingTileProperties['properties']>;
}

const HeadingTileForm = ({ form }: HeadingTileFormProps) => {
    const { t } = useTranslation('dashboard');
    return (
        <Stack gap="md">
            <TextInput
                label={t('tileForms.headingText')}
                placeholder={t('tileForms.headingTextPlaceholder')}
                required
                {...form.getInputProps('text')}
            />
            <Switch
                label={t('tileForms.showDivider')}
                checked={form.values.showDivider ?? false}
                onChange={(e) =>
                    form.setFieldValue('showDivider', e.currentTarget.checked)
                }
            />
        </Stack>
    );
};

export default HeadingTileForm;
