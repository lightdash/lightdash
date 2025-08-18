import {
    type AbilityAction,
    type CaslSubjectNames,
} from '../authorization/types';

/**
 * Scope groups to organize permissions in the UI for admins.
 */
export enum ScopeGroup {
    CONTENT = 'content',
    PROJECT_MANAGEMENT = 'project_management',
    ORGANIZATION_MANAGEMENT = 'organization_management',
    DATA = 'data',
    SHARING = 'sharing',
    AI = 'ai',
    SPOTLIGHT = 'spotlight',
}

/**
 * Context given to scope getCondition functions
 */
export type ScopeContext = {
    organizationUuid: string;
    projectUuid: string;
    userUuid?: string;
    /** The scopes available to the current user */
    scopes: Set<ScopeName>;
    isEnterprise: boolean;
    /** The user's role name in the organization (for dynamic permission logic) */
    organizationRole: string;
    /** Configuration for dynamic permissions like PAT */
    permissionsConfig?: {
        pat: {
            enabled: boolean;
            allowedOrgRoles: string[];
        };
    };
};

/**
 * The name of the scope, based on ability and subject (e.g. "create:project")
 */
export type ScopeName = `${AbilityAction}:${CaslSubjectNames}`;

/**
 * A scope defines a specific permission in the system
 */
export type Scope = {
    /**
     * The name of the scope, based on ability and subject (e.g. "create:Project")
     */
    name: ScopeName;
    /**
     * A helpful description of the permission
     */
    description: string;
    /**
     * Whether this is a commercial/enterprise feature requiring an enterprise license
     */
    isEnterprise: boolean;
    /**
     * The grouping from the ScopeGroup enum
     */
    group: ScopeGroup;
    /**
     * Get the conditions to be applied to the CASL ability derived from the scope
     */
    getConditions?: (context: ScopeContext) => Record<string, unknown>[];
};
