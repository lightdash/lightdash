import { type Comment } from '../comments';

export type ApiCreateComment = {
    status: 'ok';
    results: Comment['commentId'];
};

export type ApiGetComments = {
    status: 'ok';
    results: {
        [dashboardTileUuid: string]: Comment[];
    };
};

export type ApiResolveComment = {
    status: 'ok';
};

export type ApiDeleteComment = ApiResolveComment;
