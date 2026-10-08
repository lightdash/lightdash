import type {
    AiModelOption,
    AiOrgModelVisibility,
    AiProviderApiKeyHints,
    AiProviderApiKeysSet,
    AiProviderBaseUrls,
    ByoAiApiKeyProvider,
    ByoAiProvider,
    DataAppModelVisibility,
    UpdateAiProviderApiKeys,
} from '@lightdash/common';
import {
    BYO_AI_API_KEY_PROVIDERS,
    BYO_AI_PROVIDERS,
    isByoAiProvider,
} from '@lightdash/common';
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
    TextInput,
    Title,
} from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useState, type ComponentType, type FC, type SVGProps } from 'react';
import Callout from '../../../../../../components/common/Callout';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { filterDeprecatedModelsForPicker } from '../../../../../../components/common/ModelSelector/utils';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import AnthropicIcon from '../../../../../../svgs/anthropic.svg?react';
import GeminiIcon from '../../../../../../svgs/gemini.svg?react';
import OpenAiIcon from '../../../../../../svgs/openai.svg?react';
import { AiDataAppModelToggles } from './AiDataAppModelToggles';
import { AiProviderCredentialsCard } from './AiProviderCredentialsCard';

const PROVIDER_META: Record<
    ByoAiApiKeyProvider,
    {
        label: string;
        icon: ComponentType<SVGProps<SVGSVGElement>>;
        placeholder: string;
        // Mirrors the matching *_BASE_URL env var: Anthropic takes the host,
        // OpenAI and Gemini need their API version in the path.
        baseUrlPlaceholder: string;
    }
> = {
    anthropic: {
        label: 'Anthropic',
        icon: AnthropicIcon,
        placeholder: 'sk-ant-...',
        baseUrlPlaceholder: 'https://ai-gateway.example.com',
    },
    google: {
        label: 'Google Gemini',
        icon: GeminiIcon,
        placeholder: 'AIza...',
        baseUrlPlaceholder: 'https://ai-gateway.example.com/v1beta',
    },
    openai: {
        label: 'OpenAI',
        icon: OpenAiIcon,
        placeholder: 'sk-...',
        baseUrlPlaceholder: 'https://ai-gateway.example.com/v1',
    },
};

type ProviderVisibility = { enabled: boolean; allowedModels?: string[] };

type ProviderRowProps = {
    provider: ByoAiApiKeyProvider;
    isSet: boolean;
    hint: string | null;
    hasAnyByoKey: boolean;
    usesInstanceKey: boolean;
    providerModels: AiModelOption[];
    visibility: ProviderVisibility | undefined;
    locked: boolean;
    disabled: boolean;
    dataAppModels: {
        visibility: DataAppModelVisibility | null;
        onUpdate: (value: DataAppModelVisibility) => void;
    } | null;
    onSaveKey: (key: string) => void;
    onRemoveKey: () => void;
    onUpdateVisibility: (value: ProviderVisibility) => void;
    // Endpoint the org's key is sent to instead of the provider's public API.
    gatewayBaseUrl: string | null;
    onSaveGatewayBaseUrl: (baseUrl: string | null) => void;
};

// Mirrors the backend rule (parseLlmGatewayBaseUrl): HTTP(S), no
// credentials, query or fragment. The server remains authoritative.
const isValidGatewayBaseUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
        );
    } catch {
        return false;
    }
};

const GatewayUrlInput: FC<{
    baseUrl: string | null;
    placeholder: string;
    disabled: boolean;
    onSave: (baseUrl: string | null) => void;
}> = ({ baseUrl, placeholder, disabled, onSave }) => {
    const [value, setValue] = useState(baseUrl ?? '');
    const trimmed = value.trim();
    const isValid = isValidGatewayBaseUrl(trimmed);
    const canSave = !disabled && isValid && trimmed !== baseUrl;
    return (
        <Group gap="xs" wrap="nowrap" align="flex-end">
            <TextInput
                flex={1}
                size="xs"
                label="Custom base URL"
                description="Optional. Send requests for this key to a proxy or gateway that speaks this provider's API. Model names are passed through unchanged."
                placeholder={placeholder}
                value={value}
                disabled={disabled}
                error={
                    trimmed.length > 0 && !isValid
                        ? 'Enter an http(s) URL without credentials, query parameters or a fragment'
                        : undefined
                }
                onChange={(event) => setValue(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && canSave) onSave(trimmed);
                }}
            />
            <Button
                size="xs"
                variant="default"
                disabled={!canSave}
                onClick={() => onSave(trimmed)}
            >
                Save
            </Button>
            {baseUrl && (
                <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    disabled={disabled}
                    onClick={() => onSave(null)}
                >
                    Remove
                </Button>
            )}
        </Group>
    );
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
    dataAppModels,
    onSaveKey,
    onRemoveKey,
    onUpdateVisibility,
    gatewayBaseUrl,
    onSaveGatewayBaseUrl,
}) => {
    const {
        label,
        icon: Icon,
        placeholder,
        baseUrlPlaceholder,
    } = PROVIDER_META[provider];
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
                    flex={1}
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

            {isSet && (
                <GatewayUrlInput
                    key={gatewayBaseUrl ?? ''}
                    baseUrl={gatewayBaseUrl}
                    placeholder={baseUrlPlaceholder}
                    disabled={disabled}
                    onSave={onSaveGatewayBaseUrl}
                />
            )}

            {showAvailability && isEnabled && (
                <MultiSelect
                    size="xs"
                    label="Ask AI models"
                    aria-label={`${label} Ask AI models`}
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

            {isSet && isEnabled && dataAppModels && (
                <AiDataAppModelToggles
                    dataAppModelVisibility={dataAppModels.visibility}
                    disabled={disabled}
                    onUpdateVisibility={dataAppModels.onUpdate}
                />
            )}

            {locked && (
                <Text c="dimmed" fz="xs">
                    Disabled while your organization uses another provider key —{' '}
                    {label} models can&apos;t be selected, so AI agents never
                    fall back to the instance&apos;s {label} key. Add your own{' '}
                    {label} API key to make these models available.
                </Text>
            )}

            {usesInstanceKey && (
                <Text c="dimmed" fz="xs">
                    AI agents using {label} models currently run on the
                    instance&apos;s default key. Add your organization&apos;s{' '}
                    {label} key — or turn off availability above — to keep all
                    AI agent usage on your own keys.
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
    // Null when Data Apps are disabled for this instance. Only ever rendered
    // under Anthropic — the Claude CLI takes no other BYO provider.
    dataAppModelVisibility: DataAppModelVisibility | null;
    showDataAppModels: boolean;
    bedrockModelOptions: AiModelOption[];
    providerBaseUrls: AiProviderBaseUrls;
    disabled: boolean;
    onUpdateKeys: (providerApiKeys: UpdateAiProviderApiKeys) => void;
    onUpdateVisibility: (modelVisibility: AiOrgModelVisibility) => void;
    onUpdateDataAppVisibility: (visibility: DataAppModelVisibility) => void;
};

export const AiProvidersCard: FC<AiProvidersCardProps> = ({
    providerApiKeysSet,
    providerApiKeyHints,
    modelVisibility,
    configurableModelOptions,
    dataAppModelVisibility,
    showDataAppModels,
    bedrockModelOptions,
    providerBaseUrls,
    disabled,
    onUpdateKeys,
    onUpdateVisibility,
    onUpdateDataAppVisibility,
}) => {
    const hasAnyByoKey = BYO_AI_PROVIDERS.some(
        (provider) => providerApiKeysSet[provider],
    );
    // Mirrors resolveEffectiveModelVisibility: once an org supplies any key,
    // providers without org keys are hidden to prevent instance-key fallback.
    const isLockedByByok = (provider: ByoAiProvider) =>
        hasAnyByoKey && !providerApiKeysSet[provider];
    const selectableModelOptions = filterDeprecatedModelsForPicker(
        configurableModelOptions ?? [],
        null,
    );

    // modelVisibility is the EFFECTIVE visibility (implicit BYOK hiding merged
    // on the backend) and configurableModelOptions spans every provider the
    // instance runs, so full coverage here means no user-selectable model —
    // and no background AI task — can fall back to an instance key.
    const visibleProviders = [
        ...new Set(selectableModelOptions.map((model) => model.provider)),
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
                        Use your organization&apos;s own Anthropic, Google
                        Gemini, or OpenAI API key for AI features, and control
                        which models users can pick. Keys are stored encrypted
                        and never shown again after saving; when set, they take
                        precedence over the instance-level keys. Agents already
                        using a hidden model keep working — it just can&apos;t
                        be selected again.
                    </Text>
                </Box>

                {allAiOnOrgKeys && (
                    <Callout
                        variant="success"
                        icon={<MantineIcon icon={IconKey} />}
                        title={`AI agents run on your organization's API ${
                            setKeyCount > 1 ? 'keys' : 'key'
                        }`}
                    >
                        Agent responses and background agent tasks (thread
                        titles, suggestions, summaries) use the{' '}
                        {setKeyCount > 1 ? 'keys' : 'key'} configured below —
                        never the instance&apos;s default keys.
                    </Callout>
                )}
                <Text fz="sm" c="dimmed">
                    Autopilot setup shows which provider, model, and key it
                    uses. Scheduled runs can make multiple model calls and incur
                    usage on that key.
                </Text>
                {BYO_AI_API_KEY_PROVIDERS.map((provider, index) => (
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
                            providerModels={selectableModelOptions.filter(
                                (model) => model.provider === provider,
                            )}
                            visibility={modelVisibility?.[provider]}
                            locked={isLockedByByok(provider)}
                            disabled={disabled}
                            dataAppModels={
                                showDataAppModels && provider === 'anthropic'
                                    ? {
                                          visibility: dataAppModelVisibility,
                                          onUpdate: onUpdateDataAppVisibility,
                                      }
                                    : null
                            }
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
                            gatewayBaseUrl={providerBaseUrls[provider]}
                            onSaveGatewayBaseUrl={(baseUrl) =>
                                onUpdateKeys({
                                    providerBaseUrls: { [provider]: baseUrl },
                                })
                            }
                        />
                    </Stack>
                ))}
                <Divider />
                <AiProviderCredentialsCard models={bedrockModelOptions} />
            </Stack>
        </SettingsCard>
    );
};
