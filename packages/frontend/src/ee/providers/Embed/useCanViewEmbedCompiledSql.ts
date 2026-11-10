import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useIsEmbedded from './useIsEmbedded';

const useCanViewEmbedCompiledSql = (): boolean => {
    const isEmbedded = useIsEmbedded();
    const ability = useAbilityContext();
    return !isEmbedded || ability.can('view', 'EmbedCompiledSql');
};

export default useCanViewEmbedCompiledSql;
