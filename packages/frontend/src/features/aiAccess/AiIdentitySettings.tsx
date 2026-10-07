import { type AiAccessPolicy } from '@lightdash/common';
import { type ReactNode } from 'react';
import { SnowflakeIdentityCard } from './AiSnowflakeIdentity';

export const AiIdentitySettings = ({
    projectUuid,
    connection,
    policy,
    connectionSelector,
}: {
    projectUuid: string;
    connection: string | null;
    policy: AiAccessPolicy | null;
    connectionSelector: ReactNode;
}) => (
    <SnowflakeIdentityCard
        projectUuid={projectUuid}
        connection={connection}
        policy={policy}
        connectionSelector={connectionSelector}
    />
);
