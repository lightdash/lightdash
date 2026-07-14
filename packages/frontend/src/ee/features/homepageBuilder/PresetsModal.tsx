import { type HomepageConfig } from '@lightdash/common';
import { Badge, Card, Group, SimpleGrid, Stack, Text } from '@mantine-8/core';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { homepagePresets, type HomepagePreset } from './presets';

type Props = {
    opened: boolean;
    onClose: () => void;
    onApply: (config: HomepageConfig) => void;
};

export const PresetsModal: FC<Props> = ({ opened, onClose, onApply }) => {
    const isAiEnabled = useAiAgentButtonVisibility();
    const [presetToConfirm, setPresetToConfirm] =
        useState<HomepagePreset | null>(null);

    const applyPreset = (preset: HomepagePreset) => {
        const config = preset.create();
        const rows = config.rows
            .map((configRow) => ({
                ...configRow,
                blocks: configRow.blocks.filter(
                    (block) => block.type !== 'ai' || isAiEnabled,
                ),
            }))
            .filter((configRow) => configRow.blocks.length > 0);
        onApply({ ...config, rows });
        setPresetToConfirm(null);
        onClose();
    };

    return (
        <>
            <MantineModal
                opened={opened && presetToConfirm === null}
                onClose={onClose}
                title="Start from a preset"
                size="xl"
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        Replaces the current draft. You can tweak every block
                        after.
                    </Text>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        {homepagePresets.map((preset) => (
                            <Card
                                key={preset.key}
                                withBorder
                                p="md"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setPresetToConfirm(preset)}
                            >
                                <Stack gap="xs">
                                    <Group gap="sm">
                                        <MantineIcon
                                            icon={preset.icon}
                                            size="lg"
                                        />
                                        <Text fw={600} size="sm">
                                            {preset.name}
                                        </Text>
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        {preset.description}
                                    </Text>
                                    <Group gap={4}>
                                        {preset.blockChips.map((chip) => (
                                            <Badge
                                                key={chip}
                                                variant="default"
                                                size="xs"
                                                tt="none"
                                            >
                                                {chip}
                                            </Badge>
                                        ))}
                                    </Group>
                                </Stack>
                            </Card>
                        ))}
                    </SimpleGrid>
                </Stack>
            </MantineModal>
            <MantineModal
                opened={presetToConfirm !== null}
                onClose={() => setPresetToConfirm(null)}
                title={`Apply “${presetToConfirm?.name}”?`}
                onConfirm={() =>
                    presetToConfirm && applyPreset(presetToConfirm)
                }
            >
                <Text size="sm">
                    This replaces the current draft for this homepage. The
                    published version stays live until you publish again.
                </Text>
            </MantineModal>
        </>
    );
};
