import type { AiModelOption } from '@lightdash/common';
import { Group, Paper, Switch, Text } from '@mantine/core';
import { IconSwords } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';

interface Props {
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    models: AiModelOption[];
    modelAKey: string | null;
    modelBKey: string | null;
    onModelAChange: (modelKey: string) => void;
    onModelBChange: (modelKey: string) => void;
}

export const BattleModeSetup: FC<Props> = ({
    enabled,
    onEnabledChange,
    models,
    modelAKey,
    modelBKey,
    onModelAChange,
    onModelBChange,
}) => (
    <Paper withBorder radius="md" px="sm" py="xs">
        <Group justify="space-between" wrap="wrap" gap="sm">
            <Switch
                size="sm"
                checked={enabled}
                onChange={(event) =>
                    onEnabledChange(event.currentTarget.checked)
                }
                label={
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon icon={IconSwords} />
                        <Text size="sm" fw={500}>
                            Battle mode
                        </Text>
                    </Group>
                }
            />
            {enabled && (
                <Group gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed">
                        A
                    </Text>
                    <ModelSelector
                        models={models}
                        value={modelAKey}
                        onChange={onModelAChange}
                        variant="subtle"
                        color="gray"
                        size="xs"
                    />
                    <Text size="xs" c="dimmed">
                        vs
                    </Text>
                    <Text size="xs" c="dimmed">
                        B
                    </Text>
                    <ModelSelector
                        models={models}
                        value={modelBKey}
                        onChange={onModelBChange}
                        variant="subtle"
                        color="gray"
                        size="xs"
                    />
                </Group>
            )}
        </Group>
        {enabled && (
            <Text size="xs" c="dimmed" mt={6}>
                Your prompt is sent to both models in separate threads. You will
                see both answers side by side with time to first token and total
                response time.
            </Text>
        )}
    </Paper>
);
