import {
    type ApiError,
    type FeatureFlag,
    type HealthState,
    type Organization,
    type Project,
} from '@lightdash/common';
import { type Icon as TablerIcon } from '@tabler/icons-react';
import { type UserWithAbility } from '../user/useUser';

export type SettingsNavItem = {
    label: string;
    to: string;
    icon: TablerIcon;
    /** Hidden search aliases so e.g. "sso" finds "Single Sign-On". */
    keywords: string[];
    children: SettingsNavItem[];
    exact?: boolean;
    onClick?: () => void;
};

export type SettingsNavSection = {
    id: string;
    title: string;
    /** Secondary line under the title, e.g. the current project name. */
    subtitle: string | null;
    items: SettingsNavItem[];
};

/**
 * Return shape of `useSettingsNavSections`: the derived sidebar model plus the
 * gating context and query loading/error state the settings page consumes.
 */
export type UseSettingsNavSectionsResult = {
    navSections: SettingsNavSection[];
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
    dataAppsFlag: FeatureFlag | undefined;
    allowPasswordAuthentication: boolean;
    hasSocialLogin: boolean | undefined;
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
