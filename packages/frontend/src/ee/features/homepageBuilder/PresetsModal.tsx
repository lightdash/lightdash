import { type HomepageConfig } from '@lightdash/common';
import { Box, Group, SimpleGrid, Stack, Text } from '@mantine-8/core';
import { useState, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { IconSquare } from './blocks/BlockShell';
import blockClasses from './blocks/blockStyles.module.css';
import { homepagePresets, type HomepagePreset } from './presets';

type Props = {
    opened: boolean;
    onClose: () => void;
    onApply: (config: HomepageConfig) => void;
};

// ts-unused-exports:disable-next-line
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
                    (block) => block.type !== 'ask-ai-hero' || isAiEnabled,
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
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={12}>
                        {homepagePresets.map((preset) => (
                            <Box
                                key={preset.key}
                                className={`${blockClasses.hoverCard} ${blockClasses.clickable}`}
                                p={15}
                                onClick={() => setPresetToConfirm(preset)}
                            >
                                <Group gap={9} mb={7} wrap="nowrap">
                                    <IconSquare icon={preset.icon} size="lg" />
                                    <Text fw={600} fz={14.5}>
                                        {preset.name}
                                    </Text>
                                </Group>
                                <Text fz={12.5} c="dimmed" lh={1.45} mb={10}>
                                    {preset.description}
                                </Text>
                                <Group gap={5}>
                                    {preset.blockChips.map((chip) => (
                                        <span
                                            key={chip}
                                            className={blockClasses.presetChip}
                                        >
                                            {chip}
                                        </span>
                                    ))}
                                </Group>
                            </Box>
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
