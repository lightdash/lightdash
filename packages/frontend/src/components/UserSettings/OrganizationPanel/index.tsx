import { getOrganizationNameSchema } from '@lightdash/common';
import { Button, Flex, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';

const validationSchema = z.object({
    organizationName: getOrganizationNameSchema(),
});

type FormValues = z.infer<typeof validationSchema>;

const OrganizationPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { isLoading: isOrganizationLoading, data: organizationData } =
        useOrganization();

    const {
        isLoading: isOrganizationUpdateLoading,
        mutate: updateOrganization,
    } = useOrganizationUpdateMutation();

    const isLoading = isOrganizationUpdateLoading || isOrganizationLoading;

    const form = useForm<FormValues>({
        initialValues: {
            organizationName: '',
        },
        validate: zodResolver(validationSchema),
    });

    useEffect(() => {
        if (isOrganizationLoading || !organizationData) return;

        const initialData = {
            organizationName: organizationData.name,
        };

        form.setInitialValues(initialData);
        form.setValues(initialData);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOrganizationLoading, organizationData]);

    const handleOnSubmit = form.onSubmit(({ organizationName }) => {
        if (!form.isValid()) return;
        updateOrganization({ name: organizationName });
    });

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack>
                <TextInput
                    label={t('organizationPanel.nameLabel')}
                    required
                    placeholder="Lightdash"
                    disabled={isLoading}
                    {...form.getInputProps('organizationName')}
                />

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isOrganizationUpdateLoading && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>
                    )}

                    <Button
                        type="submit"
                        disabled={isLoading || !form.isDirty()}
                        loading={isLoading}
                    >
                        {t('actions.update', { ns: 'common' })}
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default OrganizationPanel;
