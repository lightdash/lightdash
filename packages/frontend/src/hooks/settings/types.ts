import {
    type ApiError,
    type FeatureFlag,
    type HealthState,
    type Organization,
    type Project,
} from '@lightdash/common';
import { type Icon as TablerIcon } from '@tabler/icons-react';
import { type UserWithAbility } from '../user/useUser';

/**
 * An in-page sub-section heading (e.g. "User impersonation" inside the org
 * "General" page). Indexed by the settings search so page content — not just
 * the sidebar label — surfaces the parent nav entry. This is search metadata
 * only; the page component owns the actual rendering.
 */
export type SettingsPageSection = {
    /** The heading shown on the page. */
    title: string;
    /** Search aliases for this sub-section, e.g. "impersonate". */
    keywords: string[];
};

export type SettingsNavigationItem = {
    label: string;
    to: string;
    icon: TablerIcon;
    /** Render the gradient AI orb instead of `icon` in the sidebar. */
    aiAgentIcon?: boolean;
    /** Hidden search aliases so e.g. "sso" finds "Single Sign-On". */
    keywords: string[];
    /**
     * In-page sub-sections indexed by the settings search so a match on page
     * content surfaces this entry (e.g. "impersonation" finds the "General"
     * page). Omit when the page has no notable sub-sections.
     */
    pageSections?: SettingsPageSection[];
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
    isEmailWhitelabelEnabled: boolean;
    isScimTokenManagementEnabled: FeatureFlag | undefined;
    isServiceAccountsEnabled: boolean;
    isAiCopilotEnabledOrTrial: boolean;
    shouldShowAiAgentReviews: boolean;
    // Org-level AI settings access (router config, org settings, review queue).
    canManageOrgAiAgent: boolean;
    // True when the user can manage org AI settings OR has AI agent access in at
    // least one project they can reach. Gates visibility of the "Ask AI" area.
    hasAnyAiAgentAccess: boolean;
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
