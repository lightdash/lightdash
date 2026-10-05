import { useAbilityContext } from '../../../../providers/Ability/useAbilityContext';
import { isEmbedAiAgentRoute } from './aiAgentRouting';

export const useCanViewAiAgentSql = (): boolean => {
    const ability = useAbilityContext();
    return !isEmbedAiAgentRoute() || ability.can('view', 'EmbedAiAgentSql');
};
