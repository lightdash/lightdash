import { Badge, Tooltip } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import { useModelOptions } from '../../hooks/useModelOptions';

interface Props {
    projectUuid: string;
    agentUuid: string;
    modelConfig: { modelName: string; modelProvider: string } | null;
    totalTokens?: number | null;
}

export const MessageModelIndicator: FC<Props> = ({
    projectUuid,
    agentUuid,
    modelConfig,
    totalTokens,
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

    const badge = (
        <Badge variant="transparent" color="gray" size="sm">
            {modelDisplayName}
        </Badge>
    );

    if (typeof totalTokens !== 'number') return badge;

    return (
        <Tooltip label={`Tokens used: ${totalTokens.toLocaleString()}`}>
            {badge}
        </Tooltip>
    );
};
