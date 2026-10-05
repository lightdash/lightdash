import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { AiTwinsGuide } from './AiTwinsGuide';
import { LegacySnowflakeAiBoundaryGuide } from './LegacySnowflakeAiBoundaryGuide';
export type BoundaryGuideProps = {
    projectUuid: string;
    isSnowflake: boolean;
    showAiAccessRestrictions: boolean;
};
export const SnowflakeAiBoundaryGuide = (props: BoundaryGuideProps) => {
    const flag = useServerFeatureFlag(FeatureFlags.SnowflakeAiTwins);
    return flag.data?.enabled ? (
        <AiTwinsGuide {...props} />
    ) : (
        <LegacySnowflakeAiBoundaryGuide {...props} />
    );
};
