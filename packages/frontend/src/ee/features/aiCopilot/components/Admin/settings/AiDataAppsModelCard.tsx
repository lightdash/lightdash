import {
    DATA_APP_CLAUDE_MODELS,
    getVisibleDataAppClaudeModels,
    type DataAppClaudeModel,
    type DataAppModelVisibility,
} from '@lightdash/common';
import { Box, Stack, Switch, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';

const MODEL_LABELS: Record<DataAppClaudeModel, string> = {
    opus: 'Opus',
    sonnet: 'Sonnet',
    haiku: 'Haiku',
};

type AiDataAppsModelCardProps = {
    dataAppModelVisibility: DataAppModelVisibility | null;
    disabled: boolean;
    onUpdateVisibility: (visibility: DataAppModelVisibility) => void;
};

export const AiDataAppsModelCard: FC<AiDataAppsModelCardProps> = ({
    dataAppModelVisibility,
    disabled,
    onUpdateVisibility,
}) => {
    const visibleModels = getVisibleDataAppClaudeModels(dataAppModelVisibility);

    return (
        <SettingsCard>
            <Stack gap="md">
                <Box maw={620}>
                    <Title order={5} mb={4}>
                        Data Apps models
                    </Title>
                    <Text c="dimmed" fz="xs">
                        Control which Claude models users can pick when building
                        or iterating on a Data App. Apps already built with a
                        hidden model keep working — it just can&apos;t be
                        selected again.
                    </Text>
                </Box>

                {DATA_APP_CLAUDE_MODELS.map((model) => {
                    const isVisible = visibleModels.includes(model);
                    // The server rejects hiding every model; disabling the last
                    // one here surfaces that as a dead control rather than an
                    // error toast after the fact.
                    const isLastVisible =
                        isVisible && visibleModels.length === 1;
                    return (
                        <Switch
                            key={model}
                            size="md"
                            label={MODEL_LABELS[model]}
                            description={
                                isLastVisible
                                    ? 'At least one model must stay available'
                                    : undefined
                            }
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
            </Stack>
        </SettingsCard>
    );
};
