import type { AiAgentMessage, AiModelOption } from '@lightdash/common';
import { useMemo } from 'react';
import {
    getSupersedingModel,
    matchesModelConfig,
} from '../../../../components/common/ModelSelector/utils';
import i18n from '../../../../i18n/i18n';
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
        deprecationWarning: replacement
            ? i18n.t('threadModel.deprecatedWithReplacement', {
                  ns: 'aiAgent',
                  name,
                  replacement: replacement.displayName,
              })
            : i18n.t('threadModel.deprecated', { ns: 'aiAgent', name }),
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
