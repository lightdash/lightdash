import {
    type AiModelOption,
    type AiProviderCredential,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import Callout from '../../../../../../components/common/Callout';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    useAdoptLegacyAiProviderCredential,
    useAiProviderCredentials,
    useCreateAiProviderCredential,
    useDeleteAiProviderCredential,
    useReplaceAiProviderCredential,
    useSetDefaultAiProviderCredential,
    useUpdateAiProviderCredential,
} from '../../../hooks/useAiProviderCredentials';
import {
    BedrockCredentialModal,
    type BedrockCredentialFormValues,
} from './BedrockCredentialModal';

type Props = {
    models: AiModelOption[];
};

export const AiProviderCredentialsCard: FC<Props> = ({ models }) => {
    const { data, isInitialLoading } = useAiProviderCredentials();
    const createCredential = useCreateAiProviderCredential();
    const updateCredential = useUpdateAiProviderCredential();
    const deleteCredential = useDeleteAiProviderCredential();
    const setDefaultCredential = useSetDefaultAiProviderCredential();
    const replaceCredential = useReplaceAiProviderCredential();
    const adoptLegacy = useAdoptLegacyAiProviderCredential();

    const [modalState, setModalState] = useState<{
        credential: AiProviderCredential | null;
        /** Set when repairing an unreadable row: replace, never merge. */
        replaceUuid?: string;
    } | null>(null);

    const credentials = data?.credentials ?? [];
    const legacyBedrock = data?.legacyBedrock ?? null;
    const unreadable = data?.unreadableCredentials ?? [];

    const handleSave = (values: BedrockCredentialFormValues) => {
        const { replaceUuid } = modalState ?? {};
        if (replaceUuid) {
            replaceCredential.mutate(
                {
                    credentialUuid: replaceUuid,
                    data: {
                        provider: 'bedrock',
                        label: values.label,
                        region: values.region,
                        allowedModels: values.allowedModels,
                        apiKey: values.apiKey ?? '',
                    },
                },
                { onSuccess: () => setModalState(null) },
            );
            return;
        }
        const editing = modalState?.credential;
        if (editing) {
            updateCredential.mutate(
                { credentialUuid: editing.uuid, data: values },
                { onSuccess: () => setModalState(null) },
            );
            return;
        }
        createCredential.mutate(
            {
                provider: 'bedrock',
                label: values.label,
                region: values.region,
                allowedModels: values.allowedModels,
                apiKey: values.apiKey ?? '',
            },
            { onSuccess: () => setModalState(null) },
        );
    };

    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <Title order={6}>Amazon Bedrock credentials</Title>
                <Button
                    size="xs"
                    variant="light"
                    leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    onClick={() => setModalState({ credential: null })}
                >
                    Add credential
                </Button>
            </Group>
            <Text c="dimmed" fz="xs">
                Each credential pins Ask AI to one AWS region. Projects can
                select a credential; anything without a project — Slack routing,
                thread titles — uses the default.
            </Text>

            {!isInitialLoading &&
                credentials.length === 0 &&
                legacyBedrock === null && (
                    <Paper variant="dotted" p="md">
                        <Text c="dimmed" fz="xs" ta="center">
                            No Bedrock credentials yet.
                        </Text>
                    </Paper>
                )}

            {/* Rendered until the org adds its first credential, at which point
                it is adopted as a real one. */}
            {legacyBedrock && (
                <Paper p="sm">
                    <Group justify="space-between" wrap="nowrap">
                        <Stack gap={2}>
                            <Group gap="xs">
                                <Text fz="sm" fw={500}>
                                    {legacyBedrock.region}
                                </Text>
                                <Badge size="sm">default</Badge>
                            </Group>
                            <Text c="dimmed" fz="xs">
                                {legacyBedrock.apiKeyHint} ·{' '}
                                {legacyBedrock.allowedModels.length} model(s) ·
                                configured before named credentials
                            </Text>
                        </Stack>
                        {/* This configuration predates the credentials table,
                            so it has no row to edit or delete. Converting it
                            gives it one; until then it is read-only. */}
                        <Button
                            size="xs"
                            variant="default"
                            loading={adoptLegacy.isLoading}
                            onClick={() => adoptLegacy.mutate()}
                        >
                            Convert to managed credential
                        </Button>
                    </Group>
                </Paper>
            )}

            {credentials.map((credential) => (
                <Paper key={credential.uuid} p="sm">
                    <Group justify="space-between" wrap="nowrap">
                        <Stack gap={2}>
                            <Group gap="xs">
                                <Text fz="sm" fw={500}>
                                    {credential.label}
                                </Text>
                                {credential.isDefault && (
                                    <Badge size="sm">default</Badge>
                                )}
                            </Group>
                            <Text c="dimmed" fz="xs">
                                {credential.region} · {credential.apiKeyHint} ·{' '}
                                {credential.allowedModels.length} model(s)
                            </Text>
                        </Stack>
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Tooltip label="Credential actions">
                                    <ActionIcon
                                        aria-label={`Actions for ${credential.label}`}
                                    >
                                        <MantineIcon
                                            icon={IconDots}
                                            size={16}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    onClick={() =>
                                        setModalState({ credential })
                                    }
                                >
                                    Edit
                                </Menu.Item>
                                {!credential.isDefault && (
                                    <Menu.Item
                                        onClick={() =>
                                            setDefaultCredential.mutate(
                                                credential.uuid,
                                            )
                                        }
                                    >
                                        Make default
                                    </Menu.Item>
                                )}
                                <Menu.Item
                                    c="red"
                                    onClick={() =>
                                        deleteCredential.mutate(credential.uuid)
                                    }
                                >
                                    Delete
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Paper>
            ))}

            {unreadable.length > 0 && (
                <Callout variant="warning">
                    <Stack gap="xs">
                        <Text fz="sm">
                            {unreadable.length} credential(s) cannot be read
                            with the current encryption secret. AI requests
                            pinned to them fail rather than falling back to
                            another region, so replace each one with a complete
                            configuration.
                        </Text>
                        {unreadable.map((item) => (
                            <Group key={item.uuid} gap="xs">
                                <Text fz="sm" fw={500}>
                                    {item.label}
                                </Text>
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={() =>
                                        setModalState({
                                            credential: null,
                                            replaceUuid: item.uuid,
                                        })
                                    }
                                >
                                    Replace
                                </Button>
                            </Group>
                        ))}
                    </Stack>
                </Callout>
            )}

            {(credentials.length > 0 || legacyBedrock !== null) && (
                <Text c="dimmed" fz="xs">
                    While Bedrock is configured it is the only provider Ask AI
                    uses, so agents pinned to another provider stop working
                    until you repoint them. Verified-answer semantic search and
                    AI repository editing are unavailable, because both would
                    send content outside these regions.
                </Text>
            )}

            {modalState && (
                <BedrockCredentialModal
                    opened
                    credential={modalState.credential}
                    isReplacement={Boolean(modalState.replaceUuid)}
                    models={models}
                    isSaving={
                        createCredential.isLoading ||
                        updateCredential.isLoading ||
                        replaceCredential.isLoading
                    }
                    onClose={() => setModalState(null)}
                    onSave={handleSave}
                />
            )}
        </Stack>
    );
};
