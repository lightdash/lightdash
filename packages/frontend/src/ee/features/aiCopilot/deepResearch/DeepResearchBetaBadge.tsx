import { BetaBadge } from '../../../../components/common/BetaBadge';
import { isDeepResearchBeta } from './deepResearchBeta';

export const DeepResearchBetaBadge = () =>
    isDeepResearchBeta ? <BetaBadge /> : null;
