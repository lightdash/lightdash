import { type ApiSuccess } from './api/success';

export type LinearInstallation = {
    organizationUuid: string;
    organizationName: string;
    organizationUrlKey: string;
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
