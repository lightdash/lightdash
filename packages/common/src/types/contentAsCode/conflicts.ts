export type ContentAsCodeConflictContentType = 'chart' | 'dashboard';

export type ContentAsCodeConflictResolution = 'keep_mine' | 'take_git';

export type ResolveContentAsCodeConflictRequest = {
    contentType: ContentAsCodeConflictContentType;
    slug: string;
    resolution: ContentAsCodeConflictResolution;
};

export type ContentAsCodeConflictView = {
    contentType: ContentAsCodeConflictContentType;
    slug: string;
    base: Record<string, unknown> | null;
    ours: Record<string, unknown> | null;
    theirs: Record<string, unknown> | null;
    hasIncoming: boolean;
};

export type ApiContentAsCodeConflictViewResponse = {
    status: 'ok';
    results: ContentAsCodeConflictView;
};

export type ContentAsCodeConflictResolveResult = {
    contentType: ContentAsCodeConflictContentType;
    slug: string;
    resolution: ContentAsCodeConflictResolution;
};

export type ApiContentAsCodeConflictResolveResponse = {
    status: 'ok';
    results: ContentAsCodeConflictResolveResult;
};
