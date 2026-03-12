import {
    ActionIcon,
    Button,
    CopyButton,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconCopy, IconPlug } from '@tabler/icons-react';
import { type FC } from 'react';
import { useCreateOAuthClient } from '../../../hooks/useOAuthClients';
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

export const CreateOAuthClientModal: FC<{
    onClose: () => void;
}> = ({ onClose }) => {
    const {
        data,
        mutate: createClient,
        isLoading,
        isSuccess,
    } = useCreateOAuthClient();

    const form = useForm({
        initialValues: {
            clientName: '',
            redirectUris: '',
        },
        validate: {
            clientName: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            redirectUris: (value) => {
                if (value.trim().length === 0)
                    return 'At least one redirect URI is required';
                const uris = value
                    .split('\n')
                    .map((u) => u.trim())
                    .filter(Boolean);
                for (const uri of uris) {
                    try {
                        new URL(uri);
                    } catch {
                        return `Invalid URI: ${uri}`;
                    }
                }
                return null;
            },
        },
    });

    const handleOnSubmit = form.onSubmit(({ clientName, redirectUris }) => {
        const uris = redirectUris
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean);
        createClient({ clientName, redirectUris: uris });
    });

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={
                isSuccess
                    ? 'Application registered'
                    : 'Register new OAuth application'
            }
            cancelLabel={isSuccess ? 'Close' : 'Cancel'}
            icon={IconPlug}
            actions={
                !isSuccess ? (
                    <Button
                        type="submit"
                        form="create-oauth-client-form"
                        loading={isLoading}
                    >
                        Register application
                    </Button>
                ) : undefined
            }
        >
            {!isSuccess ? (
                <form id="create-oauth-client-form" onSubmit={handleOnSubmit}>
                    <Stack>
                        <TextInput
                            label="Application name"
                            disabled={isLoading}
                            placeholder="My App"
                            required
                            {...form.getInputProps('clientName')}
                        />
                        <TextInput
                            label="Redirect URI"
                            disabled={isLoading}
                            placeholder="https://myapp.example.com/callback"
                            required
                            description="One URI per line for multiple redirect URIs"
                            {...form.getInputProps('redirectUris')}
                        />
                    </Stack>
                </form>
            ) : (
                <Stack gap="md">
                    <TextInput
                        label="Client ID"
                        readOnly
                        value={data?.clientId}
                        rightSection={
                            <CopyButton value={data?.clientId ?? ''}>
                                {({ copied, copy }) => (
                                    <Tooltip
                                        label={copied ? 'Copied' : 'Copy'}
                                        withArrow
                                        position="right"
                                    >
                                        <ActionIcon
                                            color={copied ? 'teal' : 'gray'}
                                            onClick={copy}
                                        >
                                            <MantineIcon
                                                icon={
                                                    copied
                                                        ? IconCheck
                                                        : IconCopy
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        }
                    />
                    <TextInput
                        label="Client secret"
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={data?.clientSecret}
                        rightSection={
                            <CopyButton value={data?.clientSecret ?? ''}>
                                {({ copied, copy }) => (
                                    <Tooltip
                                        label={copied ? 'Copied' : 'Copy'}
                                        withArrow
                                        position="right"
                                    >
                                        <ActionIcon
                                            color={copied ? 'teal' : 'gray'}
                                            onClick={copy}
                                        >
                                            <MantineIcon
                                                icon={
                                                    copied
                                                        ? IconCheck
                                                        : IconCopy
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        }
                    />
                    <Callout variant="warning">
                        Make sure to copy the client secret now. You won't be
                        able to see it again!
                    </Callout>
                </Stack>
            )}
        </MantineModal>
    );
};
