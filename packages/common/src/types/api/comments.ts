import { ApiCommentsResults, Comment } from '../comments';

export type ApiCreateComment = {
    status: 'ok';
    results: Comment['commentId'];
};

export type ApiGetComments = {
    status: 'ok';
    results: ApiCommentsResults;
};

export type ApiResolveComment = {
    status: 'ok';
};

export type ApiDeleteComment = ApiResolveComment;
