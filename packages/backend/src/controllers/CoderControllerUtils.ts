import type {
    ContentAsCodeWritebackSummary,
    ContentDraftSummary,
} from '@lightdash/common';
import type { RequestHandler } from 'express';
import type { ContentAsCodeWriteback } from '../models/ContentAsCodeWritebackModel';
import type { ContentDraft } from '../models/ContentDraftModel';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';

export const CODE_READ_MIDDLEWARES: RequestHandler[] = [
    allowApiKeyAuthentication,
    isAuthenticated,
];

export const CODE_WRITE_MIDDLEWARES: RequestHandler[] = [
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
];

export const codeSuccess = <Results>(
    results: Results,
): { status: 'ok'; results: Results } => ({ status: 'ok', results });

export const toWritebackSummary = (
    row: ContentAsCodeWriteback,
): ContentAsCodeWritebackSummary => ({
    contentType: row.contentType,
    slug: row.slug,
    branch: row.branch,
    prNumber: row.prNumber,
    prUrl: row.prUrl,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});

export const toDraftSummary = (draft: ContentDraft): ContentDraftSummary => ({
    uuid: draft.uuid,
    contentType: draft.contentType,
    contentUuid: draft.contentUuid,
    slug: draft.slug,
    authorUserUuid: draft.authorUserUuid,
    authorName: draft.authorName,
    status: draft.status as ContentDraftSummary['status'],
    prUrl: draft.prUrl,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
});
