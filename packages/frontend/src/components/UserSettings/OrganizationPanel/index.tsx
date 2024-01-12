import { Button, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC, useEffect } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';

const OrganizationPanel: FC = () => {
    const { isInitialLoading: isOrganizationLoading, data } = useOrganization();
    const {
        isLoading: isOrganizationUpdateLoading,
        mutate: updateOrganization,
    } = useOrganizationUpdateMutation();
    const isLoading = isOrganizationUpdateLoading || isOrganizationLoading;
    const form = useForm({
        initialValues: {
            organizationName: '',
        },
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (data) {
            setFieldValue('organizationName', data?.name);
        }
    }, [data, data?.name, setFieldValue]);

    const handleOnSubmit = form.onSubmit(({ organizationName }) => {
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

                <Button
                    display="block"
                    ml="auto"
                    type="submit"
                    disabled={isLoading}
                    loading={isLoading}
                >
                    Update
                </Button>
            </Stack>
        </form>
    );
};

export default OrganizationPanel;
