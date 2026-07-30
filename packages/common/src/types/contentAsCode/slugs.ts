export type ContentSlugRename = {
    contentUuid: string;
    name: string;
    oldSlug: string;
    newSlug: string;
};

export type ApiContentSlugUpdateResponse = {
    status: 'ok';
    results: {
        changes: ContentSlugRename[];
    };
};
