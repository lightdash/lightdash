import { type ApiSuccess } from './api/success';

export type LinearInstallation = {
    organizationUuid: string;
    organizationName: string;
    organizationUrlKey: string;
    requiresReconnect: boolean;
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
