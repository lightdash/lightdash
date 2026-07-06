import type {
    AiProviderApiKeysSet,
    UpdateAiProviderApiKeys,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    PasswordInput,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useState, type ComponentType, type FC, type SVGProps } from 'react';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import AnthropicIcon from '../../../../../../svgs/anthropic.svg?react';
import OpenAiIcon from '../../../../../../svgs/openai.svg?react';

type ProviderKeyRowProps = {
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    placeholder: string;
    isSet: boolean;
    disabled: boolean;
    onSave: (key: string) => void;
    onRemove: () => void;
};

const ProviderKeyRow: FC<ProviderKeyRowProps> = ({
    label,
    icon: Icon,
    placeholder,
    isSet,
    disabled,
    onSave,
    onRemove,
}) => {
    const [value, setValue] = useState('');

    return (
        <Group justify="space-between" wrap="nowrap" gap="md">
            <Group gap="xs">
                <Icon width={18} height={18} />
                <Title order={6}>{label}</Title>
                {isSet && (
                    <Badge size="sm" variant="light" color="green">
                        Key set
                    </Badge>
                )}
            </Group>
            <Group gap="xs" wrap="nowrap">
                <PasswordInput
                    w={280}
                    size="xs"
                    aria-label={label}
                    value={value}
                    placeholder={isSet ? '••••••••••••••••' : placeholder}
                    disabled={disabled}
                    onChange={(event) => setValue(event.currentTarget.value)}
                />
                <Box w={90}>
                    <Button
                        size="xs"
                        variant="default"
                        fullWidth
                        disabled={disabled || value.trim().length === 0}
                        onClick={() => {
                            onSave(value.trim());
                            setValue('');
                        }}
                    >
                        {isSet ? 'Update' : 'Set key'}
                    </Button>
                </Box>
                <Box w={80}>
                    {isSet && (
                        <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            fullWidth
                            disabled={disabled}
                            onClick={onRemove}
                        >
                            Remove
                        </Button>
                    )}
                </Box>
            </Group>
        </Group>
    );
};

type AiProviderApiKeysCardProps = {
    providerApiKeysSet: AiProviderApiKeysSet;
    disabled: boolean;
    onUpdate: (providerApiKeys: UpdateAiProviderApiKeys) => void;
};

export const AiProviderApiKeysCard: FC<AiProviderApiKeysCardProps> = ({
    providerApiKeysSet,
    disabled,
    onUpdate,
}) => (
    <SettingsCard>
        <Stack gap="md">
            <Box maw={620}>
                <Title order={5} mb={4}>
                    AI provider API keys
                </Title>
                <Text c="dimmed" fz="xs">
                    Use your organization&apos;s own Anthropic or OpenAI API key
                    for AI agent conversations. Keys are stored encrypted and
                    never shown again after saving. When set, they take
                    precedence over the instance-level keys.
                </Text>
            </Box>
            <ProviderKeyRow
                label="Anthropic"
                icon={AnthropicIcon}
                placeholder="sk-ant-..."
                isSet={providerApiKeysSet.anthropic}
                disabled={disabled}
                onSave={(key) => onUpdate({ anthropic: key })}
                onRemove={() => onUpdate({ anthropic: null })}
            />
            <Divider />
            <ProviderKeyRow
                label="OpenAI"
                icon={OpenAiIcon}
                placeholder="sk-..."
                isSet={providerApiKeysSet.openai}
                disabled={disabled}
                onSave={(key) => onUpdate({ openai: key })}
                onRemove={() => onUpdate({ openai: null })}
            />
        </Stack>
    </SettingsCard>
);
