import { type ApiSuccess } from './api/success';

export type LinearOAuthCredentials = {
    clientId: string;
    clientSecret: string;
};

export type LinearInstallUrl = {
    installUrl: string;
};

export type LinearInstallation = {
    organizationUuid: string;
    organizationName: string;
    organizationUrlKey: string;
    requiresReconnect: boolean;
    requiresClientSecret: boolean;
};

export type LinearTeam = {
    id: string;
    name: string;
    key: string;
};

export type LinearProject = {
    id: string;
    name: string;
};

export type LinearCreatedIssue = {
    id: string;
    identifier: string;
    url: string;
    title: string;
};

export const LINEAR_CONNECT_ERROR_PARAM = 'linearError';

export enum LinearConnectError {
    CANCELLED = 'cancelled',
    SESSION_EXPIRED = 'session_expired',
    INVALID_CLIENT = 'invalid_client',
    UNAUTHORIZED_CLIENT = 'unauthorized_client',
    INVALID_GRANT = 'invalid_grant',
    LINEAR_UNAVAILABLE = 'linear_unavailable',
    UNKNOWN = 'unknown',
}

export const isLinearConnectError = (
    value: string | null,
): value is LinearConnectError =>
    Object.values(LinearConnectError).includes(value as LinearConnectError);

export type ApiLinearInstallUrlResponse = ApiSuccess<LinearInstallUrl>;
export type ApiLinearInstallationResponse = ApiSuccess<LinearInstallation>;
export type ApiLinearTeamsResponse = ApiSuccess<LinearTeam[]>;
export type ApiLinearProjectsResponse = ApiSuccess<LinearProject[]>;

const LINEAR_ISSUE_IDENTIFIER_IN_URL = /\/issue\/([A-Za-z0-9]+-\d+)/;

export const getLinearIssueIdentifier = (url: string): string | null => {
    try {
        const { hostname, pathname } = new URL(url);
        if (hostname !== 'linear.app') {
            return null;
        }
        return pathname.match(LINEAR_ISSUE_IDENTIFIER_IN_URL)?.[1] ?? null;
    } catch {
        return null;
    }
};
