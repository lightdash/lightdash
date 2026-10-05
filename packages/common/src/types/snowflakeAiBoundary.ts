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
    status: 'pass' | 'fail' | 'skipped';
    detail: string;
    fixStep: 2 | 3 | 4 | 5;
};

export type SnowflakeAiBoundaryGuideConfig = {
    redirectUri: string;
    cloud: boolean;
    aiSignInEnabled: boolean;
    signedIn: boolean;
    memberCount: number;
    signedInMemberCount: number;
};
