import { Button, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOrganizationCreateMutation } from '../../hooks/organization/useOrganizationCreateMutation';

export const CreateOrganizationForm: FC<{
    warning: string | null;
    suggestedName: string;
}> = ({ warning, suggestedName }) => {
    const navigate = useNavigate();
    const form = useForm({ initialValues: { name: suggestedName } });
    const name = form.values.name;
    const createOrganization = useOrganizationCreateMutation();

    const create = () =>
        createOrganization.mutate(
            { name: name.trim() },
            { onSuccess: () => void navigate('/') },
        );

    return (
        <Stack gap="sm">
            {warning && <Text fw={600}>Create a new organization</Text>}
            {warning && (
                <Text size="sm" c="dimmed">
                    {warning}
                </Text>
            )}
            <TextInput
                label="Organization name"
                placeholder="For example, Acme Analytics"
                {...form.getInputProps('name')}
                error={createOrganization.error?.error.message}
            />
            <Button
                disabled={!name.trim()}
                loading={createOrganization.isLoading}
                onClick={create}
            >
                Create organization
            </Button>
        </Stack>
    );
};
