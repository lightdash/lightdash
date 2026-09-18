import type { ParametersValuesMap } from '../parameters';
import type { PromotionAction } from '../promotion';
import type { ResultColumn } from '../results';
import type { ContentAsCodeType } from './core';

export type VirtualViewAsCode = {
    contentType: ContentAsCodeType.VIRTUAL_VIEW;
    version: number;
    /** Immutable project-scoped explore name used by downstream content. */
    slug: string;
    /** Mutable display label. */
    name: string;
    sql: string;
    columns: ResultColumn[];
    parameters: ParametersValuesMap | null;
    /**
     * Name of the connection the SQL runs on, portable across projects.
     * Download emits it whenever the view is bound to a connection. Upload
     * resolves it against the target project on create; on update the stored
     * connection stays, so naming a different one is refused.
     */
    connectionName?: string;
};

export type VirtualViewAsCodeSkip = {
    slug: string;
    reason: string;
};

export type ApiVirtualViewAsCodeListResponse = {
    status: 'ok';
    results: {
        virtualViews: VirtualViewAsCode[];
        skipped: VirtualViewAsCodeSkip[];
        missingSlugs: string[];
    };
};

export type ApiVirtualViewAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};
