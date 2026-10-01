import { Button, Stack, Text, TextInput } from '@mantine/core';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useOrganizationCreateMutation } from '../../hooks/organization/useOrganizationCreateMutation';

export const CreateOrganizationForm: FC<{
    warning: string | null;
    suggestedName: string;
}> = ({ warning, suggestedName }) => {
    const navigate = useNavigate();
    const [name, setName] = useState(suggestedName);
    const createOrganization = useOrganizationCreateMutation();

    const create = () =>
        createOrganization.mutate(
            { name: name.trim() },
            { onSuccess: () => void navigate('/') },
        );

    return (
        <Stack gap="sm">
            <Text fw={600}>Create a new organization</Text>
            {warning && (
                <Text size="sm" c="dimmed">
                    {warning}
                </Text>
            )}
            <TextInput
                label="Organization name"
                placeholder="For example, Acme Analytics"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
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
