import {
    DATA_APP_CLAUDE_MODELS,
    getVisibleDataAppClaudeModels,
    type DataAppClaudeModel,
    type DataAppModelVisibility,
} from '@lightdash/common';
import { Group, Stack, Switch, Text } from '@mantine-8/core';
import { type FC } from 'react';

const MODEL_LABELS: Record<DataAppClaudeModel, string> = {
    opus: 'Opus',
    sonnet: 'Sonnet',
    haiku: 'Haiku',
};

type AiDataAppModelTogglesProps = {
    dataAppModelVisibility: DataAppModelVisibility | null;
    disabled: boolean;
    onUpdateVisibility: (visibility: DataAppModelVisibility) => void;
};

/**
 * Data App model availability, rendered inside the Anthropic provider row.
 * Separate from the provider's "Ask AI models" list because Data Apps run the
 * Claude CLI, which takes capability aliases (opus/sonnet/haiku) that track
 * the latest model in each tier rather than pinned model ids. The two can't be
 * derived from each other: allowing only "Claude Sonnet 4" for Ask AI would
 * still let `--model sonnet` run a newer Sonnet the allowlist excludes.
 */
export const AiDataAppModelToggles: FC<AiDataAppModelTogglesProps> = ({
    dataAppModelVisibility,
    disabled,
    onUpdateVisibility,
}) => {
    const visibleModels = getVisibleDataAppClaudeModels(dataAppModelVisibility);

    return (
        <Stack gap={4}>
            <Text fz="xs" fw={500}>
                Data Apps models
            </Text>
            <Text c="dimmed" fz="xs">
                Which models users can pick when building a Data App. Data Apps
                run the Claude CLI, which picks the latest model in each tier —
                so these are set separately from Ask AI models. Apps already
                built with a hidden model keep working.
            </Text>
            <Group gap="lg" mt={4}>
                {DATA_APP_CLAUDE_MODELS.map((model) => {
                    const isVisible = visibleModels.includes(model);
                    // The server rejects hiding every model; disabling the last
                    // one surfaces that as a dead control rather than an error
                    // toast after the fact.
                    const isLastVisible =
                        isVisible && visibleModels.length === 1;
                    return (
                        <Switch
                            key={model}
                            size="sm"
                            label={MODEL_LABELS[model]}
                            aria-label={`Data Apps ${MODEL_LABELS[model]}`}
                            checked={isVisible}
                            disabled={disabled || isLastVisible}
                            onChange={(event) =>
                                onUpdateVisibility({
                                    ...(dataAppModelVisibility ?? {}),
                                    [model]: event.currentTarget.checked,
                                })
                            }
                        />
                    );
                })}
            </Group>
        </Stack>
    );
};
