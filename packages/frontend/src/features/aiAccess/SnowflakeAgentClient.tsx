import {
    type OrganizationAgentIdentitySnowflakeSetup,
    type UpdateOrganizationSnowflakeAgentClient,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    PasswordInput,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useId, useState } from 'react';
import Callout from '../../components/common/Callout';
import { useSaveSnowflakeAgentClient } from './api';

type Client = OrganizationAgentIdentitySnowflakeSetup['client'];

const SnowflakeAgentClientForm = ({
    client,
    onSave,
    onCancel,
    onSaved,
}: {
    client: Client;
    onSave: () => void;
    onCancel: (() => void) | null;
    onSaved: () => void;
}) => {
    const save = useSaveSnowflakeAgentClient();
    const secretHintId = useId();
    const form = useForm<UpdateOrganizationSnowflakeAgentClient>({
        initialValues: {
            accountUrl:
                client.source === 'organization'
                    ? (client.accountUrl ?? '')
                    : '',
            clientId:
                client.source === 'organization' ? (client.clientId ?? '') : '',
            clientSecret: '',
        },
    });
    const canSave = Object.values(form.values).every((value) => value.trim());
    return (
        <Box
            component="form"
            onSubmit={form.onSubmit((values) => {
                if (!canSave || save.isLoading) return;
                onSave();
                save.mutate(values, {
                    onSuccess: () => {
                        form.setFieldValue('clientSecret', '');
                        save.reset();
                        onSaved();
                    },
                });
            })}
        >
            <Stack gap="sm">
                {client.source === 'organization' &&
                    !client.hasClientSecret && (
                        <Callout variant="warning">
                            The saved client secret could not be read. Replace
                            it to use agent sign-in.
                        </Callout>
                    )}
                <TextInput
                    label="Snowflake account URL"
                    description="We work out the sign-in and token addresses from this."
                    placeholder="https://myorg-myaccount.snowflakecomputing.com"
                    disabled={save.isLoading}
                    {...form.getInputProps('accountUrl')}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput
                        label="Client ID"
                        placeholder="OAUTH_CLIENT_ID from the query above"
                        disabled={save.isLoading}
                        {...form.getInputProps('clientId')}
                    />
                    <PasswordInput
                        label="Client secret"
                        placeholder="OAUTH_CLIENT_SECRET from the query above"
                        autoComplete="new-password"
                        aria-describedby={secretHintId}
                        disabled={save.isLoading}
                        {...form.getInputProps('clientSecret')}
                    />
                </SimpleGrid>
                <Text id={secretHintId} size="xs" c="dimmed">
                    Stored encrypted for your organization. Only organization
                    admins can replace it; it is never shown again.
                </Text>
                {save.error && (
                    <Callout variant="danger">
                        {save.error.error.message}
                    </Callout>
                )}
                <Group gap="xs">
                    <Button
                        type="submit"
                        disabled={!canSave}
                        loading={save.isLoading}
                    >
                        Save
                    </Button>
                    {onCancel && (
                        <Button
                            variant="subtle"
                            disabled={save.isLoading}
                            onClick={() => {
                                form.setFieldValue('clientSecret', '');
                                save.reset();
                                onCancel();
                            }}
                        >
                            Cancel
                        </Button>
                    )}
                </Group>
            </Stack>
        </Box>
    );
};

export const SnowflakeAgentClient = ({
    client,
    onSave,
}: {
    client: Client;
    onSave: () => void;
}) => {
    const [replacing, setReplacing] = useState(false);
    const saved = client.source === 'organization' && client.hasClientSecret;
    return (
        <Stack gap="sm">
            {saved && !replacing ? (
                <>
                    <TextInput
                        label="Snowflake account URL"
                        value={client.accountUrl ?? ''}
                        readOnly
                    />
                    <TextInput
                        label="Client ID"
                        value={client.clientId ?? ''}
                        readOnly
                    />
                    <Text size="sm">Client secret saved</Text>
                    <Group>
                        <Button
                            variant="default"
                            onClick={() => setReplacing(true)}
                        >
                            Replace client
                        </Button>
                    </Group>
                </>
            ) : (
                <SnowflakeAgentClientForm
                    client={client}
                    onSave={onSave}
                    onSaved={() => setReplacing(false)}
                    onCancel={saved ? () => setReplacing(false) : null}
                />
            )}
        </Stack>
    );
};
