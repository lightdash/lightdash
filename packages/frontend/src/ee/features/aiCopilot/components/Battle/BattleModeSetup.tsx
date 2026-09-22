import type { AiModelOption } from '@lightdash/common';
import { Group, Paper, SegmentedControl, Switch, Text } from '@mantine/core';
import { IconSwords } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';

export type BattleType = 'models' | 'speed';

interface Props {
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    battleType: BattleType;
    onBattleTypeChange: (type: BattleType) => void;
    models: AiModelOption[];
    modelAKey: string | null;
    modelBKey: string | null;
    onModelAChange: (modelKey: string) => void;
    onModelBChange: (modelKey: string) => void;
}

export const BattleModeSetup: FC<Props> = ({
    enabled,
    onEnabledChange,
    battleType,
    onBattleTypeChange,
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
                    <SegmentedControl
                        size="xs"
                        value={battleType}
                        onChange={(value) =>
                            onBattleTypeChange(value as BattleType)
                        }
                        data={[
                            { value: 'speed', label: 'Speed features' },
                            { value: 'models', label: 'Models' },
                        ]}
                    />
                    <ModelSelector
                        models={models}
                        value={modelAKey}
                        onChange={onModelAChange}
                        variant="subtle"
                        color="gray"
                        size="xs"
                    />
                    {battleType === 'models' && (
                        <>
                            <Text size="xs" c="dimmed">
                                vs
                            </Text>
                            <ModelSelector
                                models={models}
                                value={modelBKey}
                                onChange={onModelBChange}
                                variant="subtle"
                                color="gray"
                                size="xs"
                            />
                        </>
                    )}
                </Group>
            )}
        </Group>
        {enabled && (
            <Text size="xs" c="dimmed" mt={6}>
                {battleType === 'speed'
                    ? 'Same prompt and model. A uses JEV plus fast/adaptive features; B is the baseline. Replies continue both threads side by side.'
                    : 'Your prompt is sent to both models in separate threads. Replies continue both sides with timing and token usage.'}
            </Text>
        )}
    </Paper>
);
