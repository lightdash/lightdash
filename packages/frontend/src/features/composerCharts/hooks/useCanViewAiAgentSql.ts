import useIsEmbedded from '../../../ee/providers/Embed/useIsEmbedded';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';

export const useCanViewAiAgentSql = (): boolean => {
    const ability = useAbilityContext();
    const isEmbed = useIsEmbedded();
    return !isEmbed || ability.can('view', 'EmbedCompiledSql');
};
