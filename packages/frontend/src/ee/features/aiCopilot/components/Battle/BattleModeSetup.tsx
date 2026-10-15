import type { AiModelOption } from '@lightdash/common';
import { Group, Paper, SegmentedControl, Switch, Text } from '@mantine/core';
import { IconSwords } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ModelSelector } from '../../../../../components/common/ModelSelector/ModelSelector';

export type BattleType = 'models' | 'speed' | 'decisions';

const isBattleType = (value: string): value is BattleType =>
    value === 'models' || value === 'speed' || value === 'decisions';

interface Props {
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    battleType: BattleType;
    onBattleTypeChange: (type: BattleType) => void;
    speedBattleAvailable: boolean;
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
    speedBattleAvailable,
    models,
    modelAKey,
    modelBKey,
    onModelAChange,
    onModelBChange,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
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
                                {t('battle.setup.battleMode')}
                            </Text>
                        </Group>
                    }
                />
                {enabled && (
                    <Group gap="xs" wrap="nowrap">
                        {speedBattleAvailable && (
                            <SegmentedControl
                                size="xs"
                                value={battleType}
                                onChange={(value) => {
                                    if (isBattleType(value))
                                        onBattleTypeChange(value);
                                }}
                                data={[
                                    {
                                        value: 'speed',
                                        label: t('battle.setup.types.speed'),
                                    },
                                    {
                                        value: 'decisions',
                                        label: t(
                                            'battle.setup.types.decisions',
                                        ),
                                    },
                                    {
                                        value: 'models',
                                        label: t('battle.setup.types.models'),
                                    },
                                ]}
                            />
                        )}
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
                                    {t('battle.setup.vs')}
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
                    {battleType === 'speed' &&
                        t('battle.setup.descriptions.speed')}
                    {battleType === 'decisions' &&
                        t('battle.setup.descriptions.decisions')}
                    {battleType === 'models' &&
                        t('battle.setup.descriptions.models')}
                </Text>
            )}
        </Paper>
    );
};
