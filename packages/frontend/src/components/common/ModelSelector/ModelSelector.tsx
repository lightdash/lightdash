import type { AiModelOption } from '@lightdash/common';
import {
    Button,
    Menu,
    rem,
    Stack,
    Text,
    type ButtonProps,
} from '@mantine-8/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../MantineIcon';

interface Props extends Omit<ButtonProps, 'value' | 'onChange'> {
    models: AiModelOption[];
    value: string | null;
    onChange: (modelId: string) => void;
}

export const ModelSelector: FC<Props> = ({
    models,
    value,
    onChange,
    ...buttonProps
}) => {
    const selectedModel = useMemo(
        () => models.find((m) => m.name === value),
        [models, value],
    );

    const groupedModels = useMemo(() => {
        const groups = new Map<string, AiModelOption[]>();
        models.forEach((model) => {
            const existing = groups.get(model.provider) ?? [];
            groups.set(model.provider, [...existing, model]);
        });
        return groups;
    }, [models]);

    const providerGroups = useMemo(
        () => Array.from(groupedModels.keys()),
        [groupedModels],
    );

    if (models.length === 1) {
        return null;
    }

    return (
        <Menu
            shadow="md"
            width={280}
            position="bottom-start"
            withinPortal={false}
        >
            <Menu.Target>
                <Button
                    variant="subtle"
                    color="gray"
                    px="xs"
                    h={rem(36)}
                    {...buttonProps}
                    rightSection={
                        <MantineIcon
                            icon={IconChevronDown}
                            size="sm"
                            color="ldGray.6"
                        />
                    }
                >
                    <Text size="sm" fw={500}>
                        {selectedModel?.displayName ?? 'Select model'}
                    </Text>
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {providerGroups.map((provider, groupIndex) => {
                    const providerModels = groupedModels.get(provider) ?? [];
                    return (
                        <div key={provider}>
                            {providerGroups.length > 1 && (
                                <Menu.Label>{provider}</Menu.Label>
                            )}

                            {providerModels.map((model) => {
                                const isSelected = model.name === value;
                                return (
                                    <Menu.Item
                                        key={model.name}
                                        onClick={() => onChange(model.name)}
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
            </Menu.Dropdown>
        </Menu>
    );
};
