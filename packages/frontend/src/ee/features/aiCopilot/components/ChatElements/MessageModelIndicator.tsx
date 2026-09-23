import { Badge } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { matchesModelConfig } from '../../../../../components/common/ModelSelector/utils';
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

        const model = modelOptions.find((option) =>
            matchesModelConfig(option, modelConfig),
        );
        return model?.displayName ?? null;
    }, [modelConfig, modelOptions]);

    if (!modelDisplayName) return null;

    return (
        // fz matches the sources toggle so the footer reads as one metadata row
        <Badge variant="transparent" size="sm" fz="xs">
            {modelDisplayName}
        </Badge>
    );
};
