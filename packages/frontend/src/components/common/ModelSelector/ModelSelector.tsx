import type { AiModelOption } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Menu,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import { IconBolt, IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useUiString } from '../../../ee/providers/Embed/useUiStrings';
import MantineIcon from '../MantineIcon';
import { RetiredModelBadge } from './RetiredModelBadge';
import {
    filterDeprecatedModelsForPicker,
    getModelGroupLabel,
    getModelKey,
} from './utils';

// Opt-in for composers only: settings pickers set the agent's own model and
// have no default to fall back to.
export type AgentDefaultOption = {
    model: AiModelOption | null;
    isSelected: boolean;
    onSelect: () => void;
};

interface Props extends Omit<ButtonProps, 'value' | 'onChange'> {
    models: AiModelOption[];
    value: string | null;
    onChange: (modelKey: string) => void;
    reasoningEnabled?: boolean;
    onReasoningChange?: (enabled: boolean) => void;
    fastModeEnabled?: boolean;
    onFastModeChange?: (enabled: boolean) => void;
    agentDefault?: AgentDefaultOption;
}

const SelectedCheck: FC = () => (
    <MantineIcon icon={IconCheck} size="sm" color="blue" />
);

export const ModelSelector: FC<Props> = ({
    models,
    value,
    onChange,
    reasoningEnabled,
    onReasoningChange,
    fastModeEnabled = false,
    onFastModeChange,
    agentDefault,
    ...buttonProps
}) => {
    const agentDefaultLabel = useUiString('aiAgent.modelSelector.agentDefault');
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
            const groupLabel = getModelGroupLabel(model);
            const existing = groups.get(groupLabel);
            if (existing) {
                existing.push(model);
            } else {
                groups.set(groupLabel, [model]);
            }
        });
        return groups;
    }, [visibleModels]);

    const modelGroups = useMemo(
        () => Array.from(groupedModels.keys()),
        [groupedModels],
    );

    const showReasoning =
        selectedModel?.supportsReasoning === true &&
        onReasoningChange !== undefined;
    const reasoningLabel = reasoningEnabled ? 'High' : null;

    const showFastMode = onFastModeChange !== undefined;
    const fastModeOn = showFastMode && fastModeEnabled;

    if (visibleModels.length === 1 && !showReasoning && !showFastMode) {
        return null;
    }

    return (
        <Menu width={340} position="top-end" offset={8}>
            <Menu.Target>
                <Tooltip
                    label="Jev picks the quickest way to answer, so simple questions come back faster"
                    multiline
                    w={240}
                    position="top"
                    openDelay={300}
                    disabled={!fastModeOn}
                >
                    <Button
                        px="xs"
                        {...buttonProps}
                        data-fast-mode={fastModeOn || undefined}
                        leftSection={
                            fastModeOn ? (
                                <MantineIcon
                                    icon={IconBolt}
                                    size="sm"
                                    color="blue.6"
                                    fill="blue.6"
                                />
                            ) : undefined
                        }
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
                </Tooltip>
            </Menu.Target>

            <Menu.Dropdown>
                {showFastMode && (
                    <>
                        <Menu.Item
                            aria-label={
                                fastModeOn
                                    ? 'Disable Fast mode'
                                    : 'Enable Fast mode'
                            }
                            closeMenuOnClick={false}
                            onClick={() => onFastModeChange(!fastModeOn)}
                            leftSection={
                                <MantineIcon
                                    icon={IconBolt}
                                    size="sm"
                                    color={fastModeOn ? 'blue.6' : 'ldGray.6'}
                                />
                            }
                            rightSection={
                                fastModeOn ? (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size="sm"
                                        color="blue.6"
                                    />
                                ) : null
                            }
                        >
                            <Stack gap={0}>
                                <Text size="sm" fw={500}>
                                    Fast
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Quickest route for simple questions
                                </Text>
                            </Stack>
                        </Menu.Item>
                        <Menu.Divider />
                    </>
                )}
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
                    {agentDefault && (
                        <>
                            <Menu.Item
                                onClick={agentDefault.onSelect}
                                rightSection={
                                    agentDefault.isSelected ? (
                                        <SelectedCheck />
                                    ) : null
                                }
                            >
                                <Text size="sm" fw={500}>
                                    {agentDefaultLabel}
                                    {agentDefault.model && (
                                        <Text size="sm" c="dimmed" span>
                                            {' · '}
                                            {agentDefault.model.displayName}
                                        </Text>
                                    )}
                                </Text>
                            </Menu.Item>
                            <Menu.Divider />
                        </>
                    )}
                    {modelGroups.map((groupLabel, groupIndex) => {
                        const groupModels = groupedModels.get(groupLabel) ?? [];
                        return (
                            <Box key={groupLabel}>
                                {modelGroups.length > 1 && (
                                    <Menu.Label>{groupLabel}</Menu.Label>
                                )}

                                {groupModels.map((model) => {
                                    const modelKey = getModelKey(model);
                                    const isSelected =
                                        modelKey === value &&
                                        !agentDefault?.isSelected;
                                    return (
                                        <Menu.Item
                                            key={modelKey}
                                            onClick={() => onChange(modelKey)}
                                            rightSection={
                                                isSelected ? (
                                                    <SelectedCheck />
                                                ) : null
                                            }
                                        >
                                            <Stack gap={0}>
                                                <Group gap={6} wrap="nowrap">
                                                    <Text size="sm" fw={500}>
                                                        {model.displayName}
                                                    </Text>
                                                    {model.deprecated && (
                                                        <RetiredModelBadge />
                                                    )}
                                                </Group>
                                                {model.description && (
                                                    <Text size="xs" c="dimmed">
                                                        {model.description}
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Menu.Item>
                                    );
                                })}

                                {groupIndex < modelGroups.length - 1 && (
                                    <Menu.Divider />
                                )}
                            </Box>
                        );
                    })}
                </ScrollArea.Autosize>
            </Menu.Dropdown>
        </Menu>
    );
};
