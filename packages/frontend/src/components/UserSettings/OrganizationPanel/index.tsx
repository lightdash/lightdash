import { Button, Flex, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, type FC } from 'react';
import { z } from 'zod';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';

const validationSchema = z.object({
    organizationName: z.string().nonempty(),
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
                    label="Organization name"
                    required
                    placeholder="Lightdash"
                    disabled={isLoading}
                    {...form.getInputProps('organizationName')}
                />

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isOrganizationUpdateLoading && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            Cancel
                        </Button>
                    )}

                    <Button
                        display="block"
                        type="submit"
                        disabled={isLoading || !form.isDirty()}
                        loading={isLoading}
                    >
                        Update
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default OrganizationPanel;
