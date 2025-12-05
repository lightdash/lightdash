import { Badge } from '@mantine-8/core';
import { type FC, useMemo } from 'react';
import { useModelOptions } from '../../hooks/useModelOptions';

interface Props {
    projectUuid: string;
    agentUuid: string;
    modelConfig: { modelName: string; modelProvider: string } | null;
}

export const MessageModelIndicator: FC<Props> = ({
    projectUuid,
    agentUuid,
    modelConfig,
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

    return (
        <Badge variant="transparent" color="gray" size="sm">
            {modelDisplayName}
        </Badge>
    );
};
