import { LegacySnowflakeAiBoundaryGuide } from './LegacySnowflakeAiBoundaryGuide';

export type BoundaryGuideProps = {
    projectUuid: string;
    isSnowflake: boolean;
    showAiAccessRestrictions: boolean;
};

export const SnowflakeAiBoundaryGuide = (props: BoundaryGuideProps) => (
    <LegacySnowflakeAiBoundaryGuide {...props} />
);
