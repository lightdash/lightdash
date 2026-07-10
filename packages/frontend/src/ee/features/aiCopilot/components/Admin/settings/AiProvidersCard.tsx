import type {
    AiModelOption,
    AiOrgModelVisibility,
    AiProviderApiKeyHints,
    AiProviderApiKeysSet,
    ByoAiProvider,
    UpdateAiProviderApiKeys,
} from '@lightdash/common';
import { BYO_AI_PROVIDERS, isByoAiProvider } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    MultiSelect,
    PasswordInput,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { IconKey } from '@tabler/icons-react';
import { useState, type ComponentType, type FC, type SVGProps } from 'react';
import Callout from '../../../../../../components/common/Callout';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import AnthropicIcon from '../../../../../../svgs/anthropic.svg?react';
import OpenAiIcon from '../../../../../../svgs/openai.svg?react';

const PROVIDER_META: Record<
    ByoAiProvider,
    {
        label: string;
        icon: ComponentType<SVGProps<SVGSVGElement>>;
        placeholder: string;
    }
> = {
    anthropic: {
        label: 'Anthropic',
        icon: AnthropicIcon,
        placeholder: 'sk-ant-...',
    },
    openai: { label: 'OpenAI', icon: OpenAiIcon, placeholder: 'sk-...' },
};

type ProviderVisibility = { enabled: boolean; allowedModels?: string[] };

type ProviderRowProps = {
    provider: ByoAiProvider;
    isSet: boolean;
    hint: string | null;
    hasAnyByoKey: boolean;
    usesInstanceKey: boolean;
    providerModels: AiModelOption[];
    visibility: ProviderVisibility | undefined;
    locked: boolean;
    disabled: boolean;
    onSaveKey: (key: string) => void;
    onRemoveKey: () => void;
    onUpdateVisibility: (value: ProviderVisibility) => void;
};

const ProviderRow: FC<ProviderRowProps> = ({
    provider,
    isSet,
    hint,
    hasAnyByoKey,
    usesInstanceKey,
    providerModels,
    visibility,
    locked,
    disabled,
    onSaveKey,
    onRemoveKey,
    onUpdateVisibility,
}) => {
    const { label, icon: Icon, placeholder } = PROVIDER_META[provider];
    const [value, setValue] = useState('');

    // Availability controls only make sense once the org brings its own key —
    // otherwise there's nothing to restrict (the instance keys aren't governed
    // here). The instance's model options exist regardless, so gate on the key.
    const showAvailability = hasAnyByoKey && providerModels.length > 0;
    const isEnabled = !locked && (visibility?.enabled ?? true);

    return (
        <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap" gap="md">
                <Group gap="xs">
                    <Icon width={18} height={18} />
                    <Title order={6}>{label}</Title>
                    {isSet && (
                        <Badge
                            size="sm"
                            variant="light"
                            color="green"
                            leftSection={
                                <MantineIcon icon={IconKey} size={12} />
                            }
                        >
                            Active
                        </Badge>
                    )}
                </Group>
                {showAvailability && (
                    <Switch
                        size="md"
                        aria-label={`${label} available to users`}
                        checked={isEnabled}
                        disabled={disabled || locked}
                        onChange={(event) =>
                            onUpdateVisibility({
                                enabled: event.currentTarget.checked,
                                allowedModels: visibility?.allowedModels,
                            })
                        }
                    />
                )}
            </Group>

            <Group gap="xs" wrap="nowrap" align="flex-end">
                <PasswordInput
                    style={{ flex: 1 }}
                    size="xs"
                    aria-label={label}
                    value={value}
                    placeholder={
                        isSet ? (hint ?? '••••••••••••••••') : placeholder
                    }
                    disabled={disabled}
                    onChange={(event) => setValue(event.currentTarget.value)}
                />
                <Button
                    size="xs"
                    variant="default"
                    disabled={disabled || value.trim().length === 0}
                    onClick={() => {
                        onSaveKey(value.trim());
                        setValue('');
                    }}
                >
                    {isSet ? 'Update' : 'Set key'}
                </Button>
                {isSet && (
                    <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        disabled={disabled}
                        onClick={onRemoveKey}
                    >
                        Remove
                    </Button>
                )}
            </Group>

            {showAvailability && isEnabled && (
                <MultiSelect
                    size="xs"
                    label="Allowed models"
                    aria-label={`${label} allowed models`}
                    placeholder={
                        visibility?.allowedModels?.length
                            ? undefined
                            : 'All models'
                    }
                    disabled={disabled}
                    data={providerModels.map((model) => ({
                        value: model.name,
                        label: model.displayName,
                    }))}
                    value={visibility?.allowedModels ?? []}
                    onChange={(allowedModels) =>
                        onUpdateVisibility({ enabled: true, allowedModels })
                    }
                />
            )}

            {locked && (
                <Text c="dimmed" fz="xs">
                    Hidden while your organization uses its own Anthropic key.
                    Add your OpenAI API key to make OpenAI models available.
                </Text>
            )}

            {usesInstanceKey && (
                <Text c="dimmed" fz="xs">
                    {label} models currently run on the instance&apos;s default
                    key. Add your organization&apos;s {label} key — or turn off
                    availability above — to keep all AI usage on your own keys.
                </Text>
            )}
        </Stack>
    );
};

type AiProvidersCardProps = {
    providerApiKeysSet: AiProviderApiKeysSet;
    providerApiKeyHints: AiProviderApiKeyHints;
    modelVisibility: AiOrgModelVisibility | null;
    configurableModelOptions: AiModelOption[] | null;
    disabled: boolean;
    onUpdateKeys: (providerApiKeys: UpdateAiProviderApiKeys) => void;
    onUpdateVisibility: (modelVisibility: AiOrgModelVisibility) => void;
};

export const AiProvidersCard: FC<AiProvidersCardProps> = ({
    providerApiKeysSet,
    providerApiKeyHints,
    modelVisibility,
    configurableModelOptions,
    disabled,
    onUpdateKeys,
    onUpdateVisibility,
}) => {
    // Mirrors resolveEffectiveModelVisibility: a BYO Anthropic key with no
    // OpenAI key hides OpenAI, and the admin can't re-enable it without a key.
    const isLockedByByok = (provider: ByoAiProvider) =>
        provider === 'openai' &&
        providerApiKeysSet.anthropic &&
        !providerApiKeysSet.openai;

    const hasAnyByoKey =
        providerApiKeysSet.anthropic || providerApiKeysSet.openai;

    // modelVisibility is the EFFECTIVE visibility (implicit BYOK hiding merged
    // on the backend) and configurableModelOptions spans every provider the
    // instance runs, so full coverage here means no user-selectable model —
    // and no background AI task — can fall back to an instance key.
    const visibleProviders = [
        ...new Set(
            (configurableModelOptions ?? []).map((model) => model.provider),
        ),
    ].filter(
        (provider) =>
            !isByoAiProvider(provider) ||
            modelVisibility?.[provider]?.enabled !== false,
    );
    const usesInstanceKey = (provider: string) =>
        !isByoAiProvider(provider) || !providerApiKeysSet[provider];
    const allAiOnOrgKeys =
        hasAnyByoKey &&
        visibleProviders.length > 0 &&
        !visibleProviders.some(usesInstanceKey);
    const setKeyCount = BYO_AI_PROVIDERS.filter(
        (provider) => providerApiKeysSet[provider],
    ).length;

    return (
        <SettingsCard>
            <Stack gap="md">
                <Box maw={620}>
                    <Title order={5} mb={4}>
                        AI providers &amp; models
                    </Title>
                    <Text c="dimmed" fz="xs">
                        Use your organization&apos;s own Anthropic or OpenAI API
                        key for AI features, and control which models users can
                        pick. Keys are stored encrypted and never shown again
                        after saving; when set, they take precedence over the
                        instance-level keys. Agents already using a hidden model
                        keep working — it just can&apos;t be selected again.
                    </Text>
                </Box>

                {allAiOnOrgKeys && (
                    <Callout
                        variant="success"
                        icon={<MantineIcon icon={IconKey} size="lg" />}
                        title={`All AI interactions use your organization's API ${
                            setKeyCount > 1 ? 'keys' : 'key'
                        }`}
                    >
                        Agent responses and background AI tasks (thread titles,
                        suggestions, summaries) run on the{' '}
                        {setKeyCount > 1 ? 'keys' : 'key'} configured below —
                        never on the instance&apos;s default keys.
                    </Callout>
                )}
                {BYO_AI_PROVIDERS.map((provider, index) => (
                    <Stack gap="md" key={provider}>
                        {index > 0 && <Divider />}
                        <ProviderRow
                            provider={provider}
                            isSet={providerApiKeysSet[provider]}
                            hint={providerApiKeyHints[provider]}
                            hasAnyByoKey={hasAnyByoKey}
                            usesInstanceKey={
                                hasAnyByoKey &&
                                visibleProviders.includes(provider) &&
                                usesInstanceKey(provider)
                            }
                            providerModels={(
                                configurableModelOptions ?? []
                            ).filter((model) => model.provider === provider)}
                            visibility={modelVisibility?.[provider]}
                            locked={isLockedByByok(provider)}
                            disabled={disabled}
                            onSaveKey={(key) =>
                                onUpdateKeys({ [provider]: key })
                            }
                            onRemoveKey={() =>
                                onUpdateKeys({ [provider]: null })
                            }
                            onUpdateVisibility={(value) =>
                                onUpdateVisibility({
                                    ...(modelVisibility ?? {}),
                                    [provider]: value,
                                })
                            }
                        />
                    </Stack>
                ))}
            </Stack>
        </SettingsCard>
    );
};
