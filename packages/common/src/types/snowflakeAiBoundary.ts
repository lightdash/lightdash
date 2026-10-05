export type SnowflakeAiBoundaryTestBody = {
    protectedColumn: {
        database: string;
        schema: string;
        table: string;
        column: string;
    } | null;
};

export type SnowflakeAiBoundaryCheck = {
    id:
        | 'agent_active'
        | 'masked_column'
        | 'result_scan_blocked'
        | 'secondary_roles_blocked';
    status: 'pass' | 'fail' | 'skipped' | 'covered' | 'not_covered';
    detail: string;
    fixStep: 2 | 3 | 4 | 5 | 7;
};

export type SnowflakeAiBoundaryGuideConfig = {
    state: SnowflakeAiBoundaryGuideState;
    statuses: Record<
        SnowflakeAiBoundarySection,
        SnowflakeAiBoundarySectionStatus
    >;
    aiIdentitiesEnabled: boolean;
    readyIdentityCount: number;
    aiIdentityAccountUuid: string | null;
    identityNames: string[];
    restrictionsEnabled: boolean;
    boundaryVerified: boolean;
    redirectUri: string;
    snowflakeAccount: string;
    cloud: boolean;
    aiSignInEnabled: boolean;
    signedIn: boolean;
    memberCount: number;
    signedInMemberCount: number;
};

export type SnowflakeAiBoundarySection =
    | 'prerequisites'
    | 'masking'
    | 'session_policy'
    | 'identities'
    | 'oauth'
    | 'checks';

export type SnowflakeAiBoundarySectionStatus =
    | 'verified'
    | 'marked_done'
    | 'needs_attention'
    | 'not_started';

export type SnowflakeAiBoundaryAttribution = {
    userUuid: string;
    name: string;
    at: string;
};

export type SnowflakeAiBoundaryGuideState = {
    marks: Partial<
        Record<SnowflakeAiBoundarySection, SnowflakeAiBoundaryAttribution>
    >;
    lastTest:
        | (SnowflakeAiBoundaryAttribution & {
              checks: SnowflakeAiBoundaryCheck[];
              protectedColumn: SnowflakeAiBoundaryTestBody['protectedColumn'];
              aiIdentitiesEnabled: boolean;
          })
        | null;
};

export type SnowflakeAiBoundaryGuideUpdate = {
    section: SnowflakeAiBoundarySection;
    markedDone: boolean;
};
