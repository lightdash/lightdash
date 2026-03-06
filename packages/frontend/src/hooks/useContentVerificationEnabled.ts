import { FeatureFlags } from '@lightdash/common';
import { useClientFeatureFlag } from './useServerOrClientFeatureFlag';

export const useContentVerificationEnabled = () =>
    useClientFeatureFlag(FeatureFlags.ContentVerification);
