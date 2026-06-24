import {
    type ApiError,
    type FeatureFlag,
    type HealthState,
    type Organization,
    type Project,
} from '@lightdash/common';
import { type Icon as TablerIcon } from '@tabler/icons-react';
import { type UserWithAbility } from '../user/useUser';

export type SettingsNavigationItem = {
    label: string;
    to: string;
    icon: TablerIcon;
    /** Render the gradient AI orb instead of `icon` in the sidebar. */
    aiAgentIcon?: boolean;
    /** Hidden search aliases so e.g. "sso" finds "Single Sign-On". */
    keywords: string[];
    children: SettingsNavigationItem[];
    exact?: boolean;
    onClick?: () => void;
};

export type SettingsNavigationSection = {
    id: string;
    title: string;
    /** Secondary line under the title, e.g. the current project name. */
    subtitle: string | null;
    items: SettingsNavigationItem[];
};

/**
 * The settings page's runtime gating inputs (user + abilities,
 * health/organization/project, resolved feature flags) plus the loading/error
 * state of the underlying queries. Returned by `useSettingsContext`; the
 * router, sidebar nav, and a future settings search all derive from it.
 */
export type SettingsContext = {
    user: UserWithAbility | undefined;
    health: HealthState | undefined;
    organization: Organization | undefined;
    project: Project | undefined;
    showImpersonationPanel: boolean | undefined;
    isLeaveOrganizationEnabled: boolean;
    isCustomRolesEnabled: boolean | undefined;
    isProLimitsEnabled: boolean;
    isSsoOrganizationSettingsEnabled: boolean;
    isScimTokenManagementEnabled: FeatureFlag | undefined;
    isServiceAccountsEnabled: boolean;
    isAiCopilotEnabledOrTrial: boolean;
    shouldShowAiAgentReviews: boolean;
    isAiOrganizationSettingsLoading: boolean;
    dataAppsFlag: FeatureFlag | undefined;
    embeddingEnabled: FeatureFlag | undefined;
    allowPasswordAuthentication: boolean;
    hasSocialLogin: boolean | undefined;
    isGroupManagementEnabled: boolean;
    isWarehouseCredentialsEnabled: boolean;
    isGitProject: boolean;
    isHealthLoading: boolean;
    healthError: ApiError | null;
    isUserLoading: boolean;
    userError: ApiError | null;
    isOrganizationLoading: boolean;
    organizationError: ApiError | null;
    isActiveProjectUuidLoading: boolean;
    isProjectLoading: boolean;
    projectError: ApiError | null;
};
