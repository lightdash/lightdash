import { type SnakeCase } from 'type-fest';
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
 * A scope defines a specific permission in the system
 */
export type Scope = {
    /**
     * The name of the scope, based on ability and subject (e.g. "create:project")
     */
    name: Lowercase<`${AbilityAction}:${SnakeCase<CaslSubjectNames>}`>;
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
};
