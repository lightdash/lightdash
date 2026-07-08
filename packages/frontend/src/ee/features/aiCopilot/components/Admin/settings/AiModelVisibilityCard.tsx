import type {
    AiModelOption,
    AiOrgModelVisibility,
    ByoAiProvider,
} from '@lightdash/common';
import { BYO_AI_PROVIDERS } from '@lightdash/common';
import {
    Box,
    Divider,
    Group,
    MultiSelect,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { Fragment, type ComponentType, type FC, type SVGProps } from 'react';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import AnthropicIcon from '../../../../../../svgs/anthropic.svg?react';
import OpenAiIcon from '../../../../../../svgs/openai.svg?react';

const PROVIDER_META: Record<
    ByoAiProvider,
    { label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }
> = {
    anthropic: { label: 'Anthropic', icon: AnthropicIcon },
    openai: { label: 'OpenAI', icon: OpenAiIcon },
};

type AiModelVisibilityCardProps = {
    modelVisibility: AiOrgModelVisibility | null;
    configurableModelOptions: AiModelOption[];
    disabled: boolean;
    onUpdate: (modelVisibility: AiOrgModelVisibility) => void;
};

export const AiModelVisibilityCard: FC<AiModelVisibilityCardProps> = ({
    modelVisibility,
    configurableModelOptions,
    disabled,
    onUpdate,
}) => {
    const providers = BYO_AI_PROVIDERS.filter((provider) =>
        configurableModelOptions.some((model) => model.provider === provider),
    );
    if (providers.length === 0) return null;

    const updateProvider = (
        provider: ByoAiProvider,
        value: { enabled: boolean; allowedModels?: string[] },
    ) => onUpdate({ ...(modelVisibility ?? {}), [provider]: value });

    return (
        <SettingsCard>
            <Stack gap="md">
                <Box maw={620}>
                    <Title order={5} mb={4}>
                        Model availability
                    </Title>
                    <Text c="dimmed" fz="xs">
                        Control which AI providers and models users can pick for
                        agents and chats. Agents already using a hidden model
                        keep working; it just can&apos;t be selected again.
                    </Text>
                </Box>
                {providers.map((provider, index) => {
                    const { label, icon: Icon } = PROVIDER_META[provider];
                    const providerVisibility = modelVisibility?.[provider];
                    const isEnabled = providerVisibility?.enabled ?? true;
                    const providerModels = configurableModelOptions.filter(
                        (model) => model.provider === provider,
                    );
                    return (
                        <Fragment key={provider}>
                            {index > 0 && <Divider />}
                            <Group
                                justify="space-between"
                                wrap="nowrap"
                                gap="md"
                            >
                                <Group gap="xs">
                                    <Icon width={18} height={18} />
                                    <Title order={6}>{label}</Title>
                                </Group>
                                <Group gap="md" wrap="nowrap">
                                    {isEnabled && (
                                        <MultiSelect
                                            w={320}
                                            size="xs"
                                            aria-label={`${label} allowed models`}
                                            placeholder={
                                                providerVisibility
                                                    ?.allowedModels?.length
                                                    ? undefined
                                                    : 'All models'
                                            }
                                            disabled={disabled}
                                            data={providerModels.map(
                                                (model) => ({
                                                    value: model.name,
                                                    label: model.displayName,
                                                }),
                                            )}
                                            value={
                                                providerVisibility?.allowedModels ??
                                                []
                                            }
                                            onChange={(allowedModels) =>
                                                updateProvider(provider, {
                                                    enabled: true,
                                                    allowedModels,
                                                })
                                            }
                                        />
                                    )}
                                    <Switch
                                        size="md"
                                        aria-label={`${label} available to users`}
                                        checked={isEnabled}
                                        disabled={disabled}
                                        onChange={(event) =>
                                            updateProvider(provider, {
                                                enabled:
                                                    event.currentTarget.checked,
                                                allowedModels:
                                                    providerVisibility?.allowedModels,
                                            })
                                        }
                                    />
                                </Group>
                            </Group>
                        </Fragment>
                    );
                })}
            </Stack>
        </SettingsCard>
    );
};
