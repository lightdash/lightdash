import { v5 as uuidv5 } from 'uuid';
import {
    WarehouseTypes,
    type AthenaAuthenticationType,
    type BigqueryAuthenticationType,
    type DatabricksAuthenticationType,
    type SnowflakeAuthenticationType,
} from './projects';

export enum AgentActorSurface {
    IN_APP_AGENT = 'in_app_agent',
    MCP = 'mcp',
    API = 'api',
    SLACK_AGENT = 'slack_agent',
    CLI = 'cli',
    DATA_APP = 'data_app',
    AI_SUMMARY = 'ai_summary',
}

export const AGENT_CLIENT_IDS = {
    [AgentActorSurface.IN_APP_AGENT]: 'lightdash-chat',
    [AgentActorSurface.CLI]: 'lightdash-cli',
    [AgentActorSurface.DATA_APP]: 'lightdash-data-app',
    [AgentActorSurface.AI_SUMMARY]: 'lightdash-ai-summary',
    [AgentActorSurface.MCP]: null,
    [AgentActorSurface.API]: null,
    [AgentActorSurface.SLACK_AGENT]: null,
} as const;

export type AgentSubjectRef = {
    type: 'user' | 'service_account';
    uuid: string;
};
export type AgentActorClaim = {
    sub: string;
    surface: AgentActorSurface;
    client_id: string | null;
    agent_uuid: string | null;
};
export type AgentIdentityClaim = {
    sub: string;
    subject: AgentSubjectRef;
    act: AgentActorClaim;
};

export const buildAgentIdentityClaim = ({
    subject,
    surface,
    clientId,
    agentUuid = null,
}: {
    subject: AgentSubjectRef;
    surface: AgentActorSurface;
    clientId: string | null;
    agentUuid?: string | null;
}): AgentIdentityClaim => ({
    sub: `${subject.type}:${subject.uuid}`,
    subject,
    act: {
        sub: `${surface}:${clientId ?? 'unknown'}`,
        surface,
        client_id: clientId,
        agent_uuid: agentUuid,
    },
});

export type StoredAgentIdentityClaim = Omit<AgentIdentityClaim, 'act'> & {
    act: Omit<AgentActorClaim, 'agent_uuid'> & { agent_uuid?: string | null };
};

export const normalizeAgentIdentityClaim = (
    claim: StoredAgentIdentityClaim | null,
): AgentIdentityClaim | null =>
    claim === null
        ? null
        : {
              ...claim,
              subject: { ...claim.subject },
              act: { ...claim.act, agent_uuid: claim.act.agent_uuid ?? null },
          };

export const getAgentClientLabel = (clientId: string | null): string => {
    if (clientId === null) return 'unknown';
    const lowered = clientId.toLowerCase();
    if (/^[a-z0-9_-]{1,60}$/.test(lowered)) return lowered;
    return `h-${uuidv5(clientId, uuidv5.URL).replace(/-/g, '')}`;
};

export const AGENT_IDENTITY_SETTINGS_PATH = '/generalSettings/agentIdentity';

export const getProjectAgentIdentitySettingsPath = (
    projectUuid: string,
): string => `/generalSettings/projectManagement/${projectUuid}/agentIdentity`;

export type AiActorKind = 'person' | 'service_account';
export type AiIdentitySource =
    | 'marked_person'
    | 'agent_sign_in'
    | 'ai_service_account';

const markedOnly: Record<AiActorKind, readonly AiIdentitySource[]> = {
    person: ['marked_person'],
    service_account: ['marked_person'],
};

export const AGENT_IDENTITY_SOURCES: Record<
    WarehouseTypes,
    Record<AiActorKind, readonly AiIdentitySource[]>
> = {
    [WarehouseTypes.SNOWFLAKE]: {
        person: ['marked_person', 'agent_sign_in', 'ai_service_account'],
        service_account: [
            'marked_person',
            'agent_sign_in',
            'ai_service_account',
        ],
    },
    [WarehouseTypes.BIGQUERY]: {
        person: ['marked_person', 'ai_service_account'],
        service_account: ['marked_person', 'ai_service_account'],
    },
    [WarehouseTypes.POSTGRES]: {
        person: ['marked_person', 'ai_service_account'],
        service_account: ['marked_person', 'ai_service_account'],
    },
    [WarehouseTypes.REDSHIFT]: {
        person: ['marked_person', 'ai_service_account'],
        service_account: ['marked_person', 'ai_service_account'],
    },
    [WarehouseTypes.DATABRICKS]: {
        person: ['marked_person', 'ai_service_account'],
        service_account: ['marked_person', 'ai_service_account'],
    },
    [WarehouseTypes.TRINO]: {
        person: ['marked_person', 'ai_service_account'],
        service_account: ['marked_person', 'ai_service_account'],
    },
    [WarehouseTypes.CLICKHOUSE]: markedOnly,
    [WarehouseTypes.ATHENA]: {
        person: ['marked_person', 'ai_service_account'],
        service_account: ['marked_person', 'ai_service_account'],
    },
    [WarehouseTypes.DUCKDB]: markedOnly,
};

export const getAgentIdentityWarehouseTypes = (): WarehouseTypes[] =>
    (Object.keys(AGENT_IDENTITY_SOURCES) as WarehouseTypes[]).filter((type) =>
        Object.values(AGENT_IDENTITY_SOURCES[type]).some((sources) =>
            sources.some((source) => source !== 'marked_person'),
        ),
    );

export const isAllowedAgentIdentitySource = (
    type: WarehouseTypes,
    source: AiIdentitySource,
): boolean =>
    Object.values(AGENT_IDENTITY_SOURCES[type]).every((sources) =>
        sources.includes(source),
    );

export interface AgentIdentityProjectWithoutAiServiceAccount {
    projectUuid: string;
    name: string;
}

export interface ApiOrganizationAgentIdentityProjectsWithoutAiServiceAccountResponse {
    status: 'ok';
    results: AgentIdentityProjectWithoutAiServiceAccount[];
}

export type OrganizationAgentIdentityRule = {
    warehouseType: WarehouseTypes;
    source: AiIdentitySource;
    projectsMissingAiServiceAccount:
        | { projectUuid: string; name: string }[]
        | null;
};

export type UpdateOrganizationAgentIdentityRule = {
    source: AiIdentitySource;
};

export type OrganizationAgentIdentityOverview = {
    snowflakeConfigured: boolean;
    requireVerifiedAgentSessions: boolean;
    rules: OrganizationAgentIdentityRule[];
};

export type ApiOrganizationAgentIdentityOverviewResponse = {
    status: 'ok';
    results: OrganizationAgentIdentityOverview;
};

export type ApiOrganizationAgentIdentityRuleResponse = {
    status: 'ok';
    results: OrganizationAgentIdentityRule;
};

export const supportsAiServiceAccount = (type: WarehouseTypes): boolean =>
    Object.values(AGENT_IDENTITY_SOURCES[type]).some((sources) =>
        sources.includes('ai_service_account'),
    );

export type WarehouseServiceAuthMethod =
    | 'password'
    | 'private_key'
    | 'oauth_m2m'
    | 'iam'
    | 'access_key'
    | 'iam_role'
    | 'web_identity'
    | 'token';

const serviceAuthMethods: Record<
    WarehouseTypes,
    readonly WarehouseServiceAuthMethod[]
> = {
    [WarehouseTypes.BIGQUERY]: ['private_key'],
    [WarehouseTypes.SNOWFLAKE]: ['password', 'private_key'],
    [WarehouseTypes.POSTGRES]: ['password'],
    [WarehouseTypes.REDSHIFT]: ['password', 'iam'],
    [WarehouseTypes.DATABRICKS]: ['oauth_m2m'],
    [WarehouseTypes.TRINO]: ['password'],
    [WarehouseTypes.CLICKHOUSE]: ['password'],
    [WarehouseTypes.ATHENA]: ['access_key', 'iam_role', 'web_identity'],
    [WarehouseTypes.DUCKDB]: ['token'],
};

export const getWarehouseServiceAuthMethods = (
    type: WarehouseTypes,
): readonly WarehouseServiceAuthMethod[] => serviceAuthMethods[type];

export interface BigqueryAiServiceAccountCredentialInput {
    type: WarehouseTypes.BIGQUERY;
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY;
    keyfileContents?: { [key: string]: string };
}

export interface DatabricksAiServiceAccountCredentialInput {
    type: WarehouseTypes.DATABRICKS;
    authenticationType: DatabricksAuthenticationType.OAUTH_M2M;
    oauthClientId: string;
    oauthClientSecret: string;
}

export interface SnowflakeAiServiceAccountCredentialInput {
    type: WarehouseTypes.SNOWFLAKE;
    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY;
    user: string;
    role: string;
    warehouse: string;
    privateKey?: string;
    privateKeyPass?: string | null;
}

export interface AthenaAiServiceAccountCredentialInput {
    type: WarehouseTypes.ATHENA;
    authenticationType: AthenaAuthenticationType.ACCESS_KEY;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    workGroup: string;
    s3StagingDir: string;
    s3DataDir?: string;
}

export interface PostgresAiServiceAccountCredentialInput {
    type: WarehouseTypes.POSTGRES;
    user: string;
    password: string;
}

export interface RedshiftAiServiceAccountCredentialInput {
    type: WarehouseTypes.REDSHIFT;
    user: string;
    password: string;
}

export interface TrinoAiServiceAccountCredentialInput {
    type: WarehouseTypes.TRINO;
    user: string;
    password: string;
}

export type AiServiceAccountCredentialInput =
    | TrinoAiServiceAccountCredentialInput
    | RedshiftAiServiceAccountCredentialInput
    | PostgresAiServiceAccountCredentialInput
    | AthenaAiServiceAccountCredentialInput
    | BigqueryAiServiceAccountCredentialInput
    | DatabricksAiServiceAccountCredentialInput
    | SnowflakeAiServiceAccountCredentialInput;

export type AiServiceAccountSlot = {
    uuid: string;
    identityUuid: string;
    projectUuid: string;
    warehouseConnectionUuid: string | null;
    kind: 'ai_service_account';
    scope: 'connection';
    warehouseType: WarehouseTypes;
    method: WarehouseServiceAuthMethod;
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    credentialSubjectUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AiServiceAccountTestRequest = {
    credentials: AiServiceAccountCredentialInput | null;
};

export type AiServiceAccountTestResult = {
    ok: boolean;
    principal: string | null;
    observed: Record<string, string | null>;
    message: string;
    checkedAt: Date;
};

export interface AiServiceAccountParent {
    credentialsReadable: boolean;
    projectUuid: string;
    projectName: string | null;
    identityUuid: string;
    principal: string | null;
    verification?: AiServiceAccountTestResult | null;
}

export interface ApiAiServiceAccountStatusResponse extends ApiAiServiceAccountSlotResponse {
    parent: AiServiceAccountParent | null;
    credentialsReadable: boolean;
    verification?: AiServiceAccountTestResult | null;
}

export interface ApiAiServiceAccountSaveResponse extends ApiAiServiceAccountSlotResponse {
    verification?: AiServiceAccountTestResult | null;
}

export type ApiAiServiceAccountSlotResponse = {
    status: 'ok';
    results: AiServiceAccountSlot | null;
};

export type ApiAiServiceAccountTestResponse = {
    status: 'ok';
    results: AiServiceAccountTestResult;
};

export type SnowflakeAgentClientSource = 'organization';

export type UpdateOrganizationSnowflakeAgentClient = {
    accountUrl: string;
    clientId: string;
    clientSecret: string;
};

export type ApiUpdateOrganizationSnowflakeAgentClientResponse = {
    status: 'ok';
    results: OrganizationAgentIdentitySnowflakeSetup;
};

export type OrganizationAgentIdentitySnowflakeSetup = {
    client: {
        source: SnowflakeAgentClientSource | null;
        accountUrl: string | null;
        clientId: string | null;
        hasClientSecret: boolean;
        updatedAt: Date | null;
    };
    redirectUri: string;
    integrationSql: string;
    missingSettings: string[];
    configured: boolean;
};

export type OrganizationAgentIdentitySnowflakeVerify = {
    checkedAt: Date;
    passed: boolean;
    checks: {
        id: 'oauth_client' | 'authorize_endpoint' | 'agent_session';
        label: string;
        status: 'passed' | 'failed' | 'not_checked';
        required: boolean;
        detail: string;
    }[];
};

export type ApiOrganizationAgentIdentitySnowflakeSetupResponse = {
    status: 'ok';
    results: OrganizationAgentIdentitySnowflakeSetup;
};

export type ApiOrganizationAgentIdentitySnowflakeVerifyResponse = {
    status: 'ok';
    results: OrganizationAgentIdentitySnowflakeVerify;
};
