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
        | 'secondary_roles_blocked'
        | 'current_role';
    status: 'pass' | 'fail' | 'skipped';
    detail: string;
    fixStep: 2 | 3 | 4 | 7;
};

export type SnowflakeAiBoundaryGuideConfig = {
    state: SnowflakeAiBoundaryGuideState;
    statuses: Record<
        SnowflakeAiBoundarySection,
        SnowflakeAiBoundarySectionStatus
    >;
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
    | 'sign_in'
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
          })
        | null;
};

export type SnowflakeAiBoundaryGuideUpdate = {
    section: SnowflakeAiBoundarySection;
    markedDone: boolean;
};
