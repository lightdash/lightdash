/**
 * Semantic Layer URLs: the page you are on is the path, so links share,
 * reloads keep your place, and back goes back.
 *
 *   /semantic-layer
 *   /semantic-layer/kinds/:kind
 *   /semantic-layer/sources/:sourceId
 *   /semantic-layer/sources/:sourceId/groups/:group/:subgroup/...
 *   /semantic-layer/explores/:exploreId
 *   /semantic-layer/explores/:exploreId/fields/:fieldId
 *
 * Each group level is its own segment, so a group named a/b stays one.
 */
import { type Kind, type NodeRef } from './model';

const STUDIO_PATH = /\/semantic-layer(?=\/|$)/;

const KINDS: readonly Kind[] = ['modelled', 'sqlViews', 'files', 'live'];

export type StudioRoute = { ref: NodeRef | null };

const segmentsOf = (ref: NodeRef | null): string[] => {
    if (!ref) return [];
    switch (ref.type) {
        case 'kind':
            return ['kinds', ref.kind];
        case 'source':
            return ['sources', ref.sourceId];
        case 'group':
            return ['sources', ref.sourceId, 'groups', ...ref.path];
        case 'explore':
            return ['explores', ref.exploreId];
        case 'field':
            return ['explores', ref.exploreId, 'fields', ref.fieldId];
        default:
            return [];
    }
};

export const getSemanticStudioUrl = (
    projectUuid: string,
    { ref }: StudioRoute,
): string =>
    [
        `/projects/${projectUuid}/semantic-layer`,
        ...segmentsOf(ref).map(encodeURIComponent),
    ].join('/');

/** Deep link into Semantic Layer, on one source. */
export const getSemanticStudioSourceUrl = (
    projectUuid: string,
    sourceId: string,
): string =>
    getSemanticStudioUrl(projectUuid, {
        ref: { type: 'source', sourceId },
    });

const isKind = (value: string | undefined): value is Kind =>
    KINDS.some((kind) => kind === value);

const refOf = (segments: string[]): NodeRef | null => {
    const [first, id, third, rest] = segments;
    if (first === 'kinds' && segments.length === 2 && isKind(id)) {
        return { type: 'kind', kind: id };
    }
    if (first === 'sources' && id) {
        if (segments.length === 2) return { type: 'source', sourceId: id };
        if (
            segments.length >= 4 &&
            (third === 'folders' || third === 'groups')
        ) {
            return { type: 'group', sourceId: id, path: segments.slice(3) };
        }
    }
    if (first === 'explores' && id) {
        if (segments.length === 2) return { type: 'explore', exploreId: id };
        if (segments.length === 4 && third === 'fields' && rest) {
            return { type: 'field', exploreId: id, fieldId: rest };
        }
    }
    return null;
};

/** Reads the part of the pathname after /semantic-layer. */
export const parseSemanticStudioPath = (pathname: string): StudioRoute => {
    const match = STUDIO_PATH.exec(pathname);
    const after = match ? pathname.slice(match.index + match[0].length) : '';
    const segments = after
        .split('/')
        .filter(Boolean)
        .map((segment) => {
            try {
                return decodeURIComponent(segment);
            } catch {
                return segment;
            }
        });
    return { ref: refOf(segments) };
};
