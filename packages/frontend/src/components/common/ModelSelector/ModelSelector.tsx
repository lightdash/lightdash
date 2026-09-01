import type { AiModelOption } from '@lightdash/common';
import {
    Button,
    Group,
    Menu,
    ScrollArea,
    Stack,
    Text,
    type ButtonProps,
} from '@mantine/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../MantineIcon';
import { filterDeprecatedModelsForPicker, getModelKey } from './utils';

interface Props extends Omit<ButtonProps, 'value' | 'onChange'> {
    models: AiModelOption[];
    value: string | null;
    onChange: (modelKey: string) => void;
    reasoningEnabled?: boolean;
    onReasoningChange?: (enabled: boolean) => void;
}

export const ModelSelector: FC<Props> = ({
    models,
    value,
    onChange,
    reasoningEnabled,
    onReasoningChange,
    ...buttonProps
}) => {
    const selectedModel = useMemo(
        () => models.find((m) => getModelKey(m) === value),
        [models, value],
    );

    const visibleModels = useMemo(
        () => filterDeprecatedModelsForPicker(models, value),
        [models, value],
    );

    const groupedModels = useMemo(() => {
        const groups = new Map<string, AiModelOption[]>();
        visibleModels.forEach((model) => {
            const existing = groups.get(model.provider) ?? [];
            groups.set(model.provider, [...existing, model]);
        });
        return groups;
    }, [visibleModels]);

    const providerGroups = useMemo(
        () => Array.from(groupedModels.keys()),
        [groupedModels],
    );

    const showReasoning =
        selectedModel?.supportsReasoning === true &&
        onReasoningChange !== undefined;
    const reasoningLabel = reasoningEnabled ? 'High' : null;

    if (visibleModels.length === 1 && !showReasoning) {
        return null;
    }

    return (
        <Menu width={280} position="top-end" offset={8}>
            <Menu.Target>
                <Button
                    px="xs"
                    {...buttonProps}
                    rightSection={
                        <MantineIcon
                            icon={IconChevronDown}
                            size="sm"
                            color="dimmed"
                        />
                    }
                >
                    <Group gap={6} wrap="nowrap">
                        <Text size="xs" fw={600} c="ldGray.8" span>
                            {selectedModel?.displayName ?? 'Select model'}
                        </Text>
                        {showReasoning && reasoningLabel && (
                            <Text size="xs" fw={500} c="dimmed" span>
                                {reasoningLabel}
                            </Text>
                        )}
                    </Group>
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {showReasoning && (
                    <>
                        <Menu.Label>Reasoning</Menu.Label>
                        <Menu.Item
                            onClick={() => onReasoningChange(false)}
                            rightSection={
                                !reasoningEnabled ? (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size="sm"
                                        color="ldGray.7"
                                    />
                                ) : null
                            }
                        >
                            Default
                        </Menu.Item>
                        <Menu.Item
                            onClick={() => onReasoningChange(true)}
                            rightSection={
                                reasoningEnabled ? (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size="sm"
                                        color="ldGray.7"
                                    />
                                ) : null
                            }
                        >
                            High
                        </Menu.Item>
                        {visibleModels.length > 1 && <Menu.Divider />}
                    </>
                )}
                <ScrollArea.Autosize mah={200}>
                    {providerGroups.map((provider, groupIndex) => {
                        const providerModels =
                            groupedModels.get(provider) ?? [];
                        return (
                            <div key={provider}>
                                {providerGroups.length > 1 && (
                                    <Menu.Label>{provider}</Menu.Label>
                                )}

                                {providerModels.map((model) => {
                                    const modelKey = getModelKey(model);
                                    const isSelected = modelKey === value;
                                    return (
                                        <Menu.Item
                                            key={modelKey}
                                            onClick={() => onChange(modelKey)}
                                            rightSection={
                                                isSelected ? (
                                                    <MantineIcon
                                                        icon={IconCheck}
                                                        size="sm"
                                                        color="blue"
                                                    />
                                                ) : null
                                            }
                                        >
                                            <Stack gap={0}>
                                                <Text size="sm" fw={500}>
                                                    {model.displayName}
                                                </Text>
                                                {model.description && (
                                                    <Text size="xs" c="dimmed">
                                                        {model.description}
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Menu.Item>
                                    );
                                })}

                                {groupIndex < providerGroups.length - 1 && (
                                    <Menu.Divider />
                                )}
                            </div>
                        );
                    })}
                </ScrollArea.Autosize>
            </Menu.Dropdown>
        </Menu>
    );
};
