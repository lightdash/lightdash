import { Comment } from '../comments';

export type ApiCreateComment = {
    status: 'ok';
    results: Record<string, Comment[]>;
};

export type ApiGetComments = {
    status: 'ok';
    results: Record<string, Comment[]>;
};

export type ApiResolveComment = {
    status: 'ok';
};

export type ApiDeleteComment = ApiResolveComment;
