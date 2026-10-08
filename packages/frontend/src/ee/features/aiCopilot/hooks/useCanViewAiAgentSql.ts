import { useAbilityContext } from '../../../../providers/Ability/useAbilityContext';
import useIsEmbedded from '../../../providers/Embed/useIsEmbedded';

export const useCanViewAiAgentSql = (): boolean => {
    const ability = useAbilityContext();
    const isEmbed = useIsEmbedded();
    return !isEmbed || ability.can('view', 'EmbedCompiledSql');
};
