import type { PromotionAction } from '../promotion';

export const CONTENT_AS_CODE_VERSION = 1 as const;

export const CONTENT_AS_CODE_VERSIONS = {
    chart: 1,
    dashboard: 1,
    sql_chart: 1,
    space: 1,
    virtual_view: 1,
    scheduled_delivery: 1,
    alert: 1,
    google_sheets_sync: 1,
    ai_agent: 1,
    custom_role: 1,
    user: 1,
    group: 1,
} as const;

export type ContentAsCodeScope = 'project' | 'organization';

export type ContentAsCodeResourceKind =
    | 'chart'
    | 'dashboard'
    | 'sql_chart'
    | 'space'
    | 'virtual_view'
    | 'scheduled_delivery'
    | 'alert'
    | 'google_sheets_sync'
    | 'ai_agent'
    | 'custom_role'
    | 'user'
    | 'group';

export type ContentAsCodeIdentity = {
    resource: ContentAsCodeResourceKind;
    value: string;
};

export type ContentAsCodeDiagnostic = {
    identity: ContentAsCodeIdentity | null;
    reason: string;
};

export type ContentAsCodeListResults<
    Key extends string,
    Document,
    Extra extends object = Record<never, never>,
> = { [Property in Key]: Document[] } & Extra;

export type ApiContentAsCodeListResponse<Results extends object> = {
    status: 'ok';
    results: Results;
};

export type ContentAsCodeUpsertAction =
    | PromotionAction.CREATE
    | PromotionAction.UPDATE
    | PromotionAction.NO_CHANGES;

export type ApiContentAsCodeUpsertResponse<
    Extra extends object = Record<never, never>,
> = {
    status: 'ok';
    results: { action: ContentAsCodeUpsertAction } & Extra;
};
