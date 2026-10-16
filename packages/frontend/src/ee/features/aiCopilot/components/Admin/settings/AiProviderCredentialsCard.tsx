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
import { useTranslation } from 'react-i18next';
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
import { BEDROCK_GEOGRAPHY_LABELS } from './bedrockGeographyLabels';

type Props = {
    models: AiModelOption[];
};

export const AiProviderCredentialsCard: FC<Props> = ({ models }) => {
    const { t } = useTranslation('aiCopilotAdmin');
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
                        inferenceGeography: values.inferenceGeography,
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
                inferenceGeography: values.inferenceGeography,
            },
            { onSuccess: () => setModalState(null) },
        );
    };

    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <Title order={6}>{t('settings.bedrock.title')}</Title>
                <Button
                    size="xs"
                    variant="light"
                    leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    onClick={() => setModalState({ credential: null })}
                >
                    {t('settings.bedrock.addCredential')}
                </Button>
            </Group>
            <Text c="dimmed" fz="xs">
                {t('settings.bedrock.description')}
            </Text>

            {!isInitialLoading &&
                credentials.length === 0 &&
                legacyBedrock === null && (
                    <Paper variant="dotted" p="md">
                        <Text c="dimmed" fz="xs" ta="center">
                            {t('settings.bedrock.empty')}
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
                                <Badge size="sm">
                                    {t('settings.bedrock.default')}
                                </Badge>
                            </Group>
                            <Text c="dimmed" fz="xs">
                                {t('settings.bedrock.legacySummary', {
                                    hint: legacyBedrock.apiKeyHint,
                                    count: legacyBedrock.allowedModels.length,
                                })}
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
                            {t('settings.bedrock.convert')}
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
                                    <Badge size="sm">
                                        {t('settings.bedrock.default')}
                                    </Badge>
                                )}
                            </Group>
                            <Text c="dimmed" fz="xs">
                                {t('settings.bedrock.credentialSummary', {
                                    region: credential.region,
                                    geography:
                                        BEDROCK_GEOGRAPHY_LABELS[
                                            credential.inferenceGeography
                                        ],
                                    hint: credential.apiKeyHint,
                                    count: credential.allowedModels.length,
                                })}
                            </Text>
                        </Stack>
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Tooltip
                                    label={t(
                                        'settings.bedrock.credentialActions',
                                    )}
                                >
                                    <ActionIcon
                                        aria-label={t(
                                            'settings.bedrock.actionsFor',
                                            {
                                                label: credential.label,
                                            },
                                        )}
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
                                    {t('actions.edit', { ns: 'common' })}
                                </Menu.Item>
                                {!credential.isDefault && (
                                    <Menu.Item
                                        onClick={() =>
                                            setDefaultCredential.mutate(
                                                credential.uuid,
                                            )
                                        }
                                    >
                                        {t('settings.bedrock.makeDefault')}
                                    </Menu.Item>
                                )}
                                <Menu.Item
                                    c="red"
                                    onClick={() =>
                                        deleteCredential.mutate(credential.uuid)
                                    }
                                >
                                    {t('actions.delete', { ns: 'common' })}
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
                            {t('settings.bedrock.unreadable', {
                                count: unreadable.length,
                            })}
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
                                    {t('settings.bedrock.replace')}
                                </Button>
                            </Group>
                        ))}
                    </Stack>
                </Callout>
            )}

            {(credentials.length > 0 || legacyBedrock !== null) && (
                <Text c="dimmed" fz="xs">
                    {t('settings.bedrock.onlyProviderNote')}
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
