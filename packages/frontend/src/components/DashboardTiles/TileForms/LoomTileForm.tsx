import { type DashboardLoomTileProperties } from '@lightdash/common';
import { ActionIcon, Flex, Stack, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';

interface LoomTileFormProps {
    form: UseFormReturnType<DashboardLoomTileProperties['properties']>;
    withHideTitle: boolean;
}

const LoomTileForm = ({ form, withHideTitle }: LoomTileFormProps) => {
    const { t } = useTranslation('dashboard');
    return (
        <Stack gap="md">
            <Flex
                align={
                    form.getInputProps('title').error ? 'center' : 'flex-end'
                }
                gap="xs"
            >
                <TextInput
                    label={t('tileForms.title')}
                    placeholder={t('tileForms.titlePlaceholder')}
                    flex={1}
                    required
                    disabled={form.values.hideTitle}
                    {...form.getInputProps('title')}
                />
                {withHideTitle && (
                    <ActionIcon
                        size="lg"
                        onClick={() => {
                            form.setFieldValue(
                                'hideTitle',
                                !form.values.hideTitle,
                            );
                        }}
                    >
                        <MantineIcon
                            icon={form.values.hideTitle ? IconEyeOff : IconEye}
                        />
                    </ActionIcon>
                )}
            </Flex>

            <TextInput
                name="url"
                label={t('tileForms.loomUrl')}
                placeholder={t('tileForms.loomUrlPlaceholder')}
                required
                {...form.getInputProps('url')}
            />
        </Stack>
    );
};

export default LoomTileForm;
