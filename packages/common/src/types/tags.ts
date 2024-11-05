import type { LightdashUser } from './user';

export type Tag = {
    tagUuid: string;
    projectUuid: string;
    name: string;
    color: string;
    createdAt: Date;
    createdBy: Pick<
        LightdashUser,
        'userUuid' | 'firstName' | 'lastName'
    > | null;
};

export type ApiGetTagsResponse = {
    status: 'ok';
    results: Tag[];
};

export type ApiCreateTagResponse = {
    status: 'ok';
    results: { tagUuid: string };
};
