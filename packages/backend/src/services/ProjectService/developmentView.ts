import {
    isExploreError,
    ParameterError,
    type Account,
    type Explore,
    type ExploreError,
    type SummaryExplore,
} from '@lightdash/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Sent by a client that wants a person's unpublished model changes applied to what it reads. */
export const DEVELOPMENT_VIEW_HEADER = 'Lightdash-Development-View';

/** Names the preview project to read instead, for a project whose unpublished changes live on a branch. */
export const DEVELOPMENT_PREVIEW_HEADER = 'Lightdash-Development-Preview';

export type DevelopmentView = {
    /**
     * The explores as this person's unpublished changes leave them, by name, with
     * null for one the changes remove; null when they have nothing in development
     * on the project.
     */
    findExplores: (
        account: Account,
        projectUuid: string,
    ) => Promise<Map<string, Explore | ExploreError | null> | null>;
};

/** Set for a request that asked for the development view; absent for every other request, job and agent run. */
export const developmentView = new AsyncLocalStorage<DevelopmentView>();

/**
 * Refuses to save content from a request in the development view: what was built
 * there may use fields only this person has, and would be broken for everyone else.
 */
export const assertNotInDevelopmentView = (): void => {
    if (developmentView.getStore()) {
        throw new ParameterError(
            'Saving is off while you are trying your changes. Go back to live to save.',
        );
    }
};

/** A compiled explore as the explore list carries it, with what decides who may see its base table. */
export const toExploreSummary = (
    explore: Explore | ExploreError,
): SummaryExplore & {
    baseTableRequiredAttributes: Explore['tables'][string]['requiredAttributes'];
    baseTableAnyAttributes: Explore['tables'][string]['anyAttributes'];
} => {
    if (isExploreError(explore)) {
        return {
            name: explore.name,
            label: explore.label,
            tags: explore.tags,
            groupLabel: explore.groupLabel,
            groups: explore.groups,
            type: explore.type,
            aiHint: explore.aiHint,
            customMeta: explore.customMeta,
            errors: explore.errors,
            warehouseConnectionUuid: null,
            baseTableRequiredAttributes: undefined,
            baseTableAnyAttributes: undefined,
        };
    }
    const baseTable = explore.tables[explore.baseTable];
    return {
        name: explore.name,
        label: explore.label,
        tags: explore.tags,
        groupLabel: explore.groupLabel,
        groups: explore.groups,
        type: explore.type,
        preAggregateSource: explore.preAggregateSource,
        externalSource: explore.externalSource,
        aiHint: explore.aiHint,
        customMeta: explore.customMeta,
        warnings: explore.warnings,
        description: baseTable.description,
        schemaName: baseTable.schema,
        databaseName: baseTable.database,
        warehouseConnectionUuid: null,
        baseTableRequiredAttributes: baseTable.requiredAttributes,
        baseTableAnyAttributes: baseTable.anyAttributes,
    };
};
