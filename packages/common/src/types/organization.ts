import { OrganizationMemberRole } from './organizationMemberProfile';
import { ProjectType } from './projects';

/**
 * Details of a user's Organization
 */
export type Organisation = {
    /**
     * The unique identifier of the organisation
     * @format uuid
     */
    organizationUuid: string;
    /**
     * The name of the organisation
     */
    name: string;

    /**
     * The default color palette for all projects in the organization
     */
    chartColors?: string[];
    /**
     * The organization needs a project if it doesn't have at least one project.
     */
    needsProject?: boolean;
};

export type CreateOrganization = Pick<Organisation, 'name'>;

export type UpdateOrganization = Partial<
    Omit<Organisation, 'organizationUuid' | 'needsProject'>
>;

export type ApiOrganization = {
    status: 'ok';
    results: Organisation;
};

/**
 * Summary of a project under an organization
 */
export type OrganizationProject = {
    /**
     * The unique identifier of the project
     * @format uuid
     */
    projectUuid: string;
    name: string;
    type: ProjectType;
};

/**
 * List of projects in the current organization
 */
export type ApiOrganizationProjects = {
    status: 'ok';
    results: OrganizationProject[];
};

export type OnbordingRecord = {
    ranQueryAt: Date | null;
    shownSuccessAt: Date | null;
};

export type OnboardingStatus = {
    ranQuery: boolean;
};

export type ApiOnboardingStatusResponse = {
    status: 'ok';
    results: OnboardingStatus;
};

export type AllowedEmailDomains = {
    organizationUuid: string;
    emailDomains: string[];
    role: OrganizationMemberRole;
    projectUuids: string[];
};

export type UpdateAllowedEmailDomains = Omit<
    AllowedEmailDomains,
    'organizationUuid'
>;

export type ApiOrganizationAllowedEmailDomains = {
    status: 'ok';
    results: AllowedEmailDomains;
};
