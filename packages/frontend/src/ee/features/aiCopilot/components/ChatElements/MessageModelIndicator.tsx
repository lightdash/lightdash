import { type AiAgentProviderKeySource } from '@lightdash/common';
import { Badge, Group, Text, Tooltip } from '@mantine-8/core';
import { IconKey } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useModelOptions } from '../../hooks/useModelOptions';

interface Props {
    projectUuid: string;
    agentUuid: string;
    modelConfig: { modelName: string; modelProvider: string } | null;
    totalTokens?: number | null;
    providerKeySource?: AiAgentProviderKeySource | null;
}

export const MessageModelIndicator: FC<Props> = ({
    projectUuid,
    agentUuid,
    modelConfig,
    totalTokens,
    providerKeySource,
}) => {
    const { data: modelOptions } = useModelOptions({
        projectUuid,
        agentUuid,
    });

    const modelDisplayName = useMemo(() => {
        if (!modelConfig || !modelOptions) return null;

        const model = modelOptions.find(
            (m) => m.name === modelConfig.modelName,
        );
        return model?.displayName ?? null;
    }, [modelConfig, modelOptions]);

    if (!modelDisplayName) return null;

    const isByok = providerKeySource === 'byok';

    const tooltipLabel = (
        <>
            {typeof totalTokens === 'number' && (
                <Text size="xs">
                    Tokens used: {totalTokens.toLocaleString()}
                </Text>
            )}
            {providerKeySource && (
                <Text size="xs">
                    {isByok
                        ? "Generated with your organization's API key"
                        : "Generated with Lightdash's default API key"}
                </Text>
            )}
        </>
    );

    const badge = (
        <Badge variant="transparent" color="gray" size="sm">
            <Group gap={4} wrap="nowrap">
                {isByok && <MantineIcon icon={IconKey} size={12} />}
                {modelDisplayName}
            </Group>
        </Badge>
    );

    if (typeof totalTokens !== 'number' && !providerKeySource) return badge;

    return <Tooltip label={tooltipLabel}>{badge}</Tooltip>;
};
