import { type ApiSuccess } from './api/success';

export type JiraOAuthCredentials = {
    clientId: string;
    clientSecret: string;
};

export type JiraInstallation = {
    organizationUuid: string;
    clientId: string;
    siteId: string | null;
    siteName: string | null;
    siteUrl: string | null;
    requiresSiteSelection: boolean;
};

export type JiraSite = {
    id: string;
    name: string;
    url: string;
};

export type JiraProject = {
    id: string;
    key: string;
    name: string;
};

export type JiraIssueType = {
    id: string;
    name: string;
    subtask: boolean;
};

export type JiraCreatedIssue = {
    id: string;
    key: string;
    url: string;
};

export type JiraInstallUrl = {
    installUrl: string;
};

export type ApiJiraInstallUrlResponse = ApiSuccess<JiraInstallUrl>;
export type ApiJiraInstallationResponse = ApiSuccess<JiraInstallation>;
export type ApiJiraSitesResponse = ApiSuccess<JiraSite[]>;
export type ApiJiraProjectsResponse = ApiSuccess<JiraProject[]>;
export type ApiJiraIssueTypesResponse = ApiSuccess<JiraIssueType[]>;

const JIRA_ISSUE_KEY_IN_URL = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/;

export const getJiraIssueIdentifier = (url: string): string | null => {
    try {
        const { pathname } = new URL(url);
        return pathname.match(JIRA_ISSUE_KEY_IN_URL)?.[1] ?? null;
    } catch {
        return null;
    }
};
