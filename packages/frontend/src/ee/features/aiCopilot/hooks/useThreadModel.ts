import type { AiAgentMessage, AiModelOption } from '@lightdash/common';
import { useMemo } from 'react';
import {
    getSupersedingModel,
    matchesModelConfig,
} from '../../../../components/common/ModelSelector/utils';
import { useModelOptions } from './useModelOptions';

export type ThreadModel = {
    name: string;
    deprecationWarning: string | null;
};

export const getThreadModel = (
    messages: AiAgentMessage[],
    models: AiModelOption[],
): ThreadModel | null => {
    const modelConfig =
        messages.flatMap((message) =>
            message.role === 'assistant' && message.modelConfig
                ? [message.modelConfig]
                : [],
        )[0] ?? null;
    if (!modelConfig) return null;

    const model =
        models.find((option) => matchesModelConfig(option, modelConfig)) ??
        null;
    const name = model?.displayName ?? modelConfig.modelName;
    if (!model?.deprecated) return { name, deprecationWarning: null };

    const replacement = getSupersedingModel(models, model);
    return {
        name,
        deprecationWarning: `${name} is deprecated. Start a new thread to use ${
            replacement?.displayName ?? 'a newer model'
        }.`,
    };
};

export const useThreadModel = ({
    projectUuid,
    agentUuid,
    messages,
}: {
    projectUuid: string | undefined;
    agentUuid: string | undefined;
    messages: AiAgentMessage[] | undefined;
}): ThreadModel | null => {
    const { data: models } = useModelOptions({ projectUuid, agentUuid });
    return useMemo(
        () => getThreadModel(messages ?? [], models ?? []),
        [messages, models],
    );
};
