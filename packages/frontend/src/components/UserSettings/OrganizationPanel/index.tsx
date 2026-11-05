import { getOrganizationNameSchema } from '@lightdash/common';
import { Button, Group, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, type FC } from 'react';
import { z } from 'zod';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
import { SettingRow } from '../../common/Settings/SettingLayout';

const validationSchema = z.object({
    organizationName: getOrganizationNameSchema(),
});

type FormValues = z.infer<typeof validationSchema>;

const OrganizationPanel: FC = () => {
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
        <SettingRow
            title="Organization name"
            description="Shown to members across the workspace and in invitations."
            control={
                <form onSubmit={handleOnSubmit}>
                    <Group gap="xs" align="flex-start">
                        <TextInput
                            aria-label="Organization name"
                            size="xs"
                            w={260}
                            required
                            placeholder="Lightdash"
                            disabled={isLoading}
                            {...form.getInputProps('organizationName')}
                        />
                        {form.isDirty() && !isOrganizationUpdateLoading && (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => form.reset()}
                            >
                                Cancel
                            </Button>
                        )}
                        <Button
                            size="xs"
                            type="submit"
                            disabled={isLoading || !form.isDirty()}
                            loading={isLoading}
                        >
                            Update
                        </Button>
                    </Group>
                </form>
            }
        />
    );
};

export default OrganizationPanel;
