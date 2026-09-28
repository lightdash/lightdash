import {
    type ApiError,
    type Document,
    type DocumentVersionList,
} from '@lightdash/common';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const PAGE_SIZE = 50;

/** Version history, newest first, one page at a time. */
export const useDocumentVersions = (
    projectUuid: string,
    documentUuid: string,
) =>
    useInfiniteQuery<DocumentVersionList, ApiError>({
        queryKey: ['document-versions', projectUuid, documentUuid],
        queryFn: ({ pageParam = 0, signal }) =>
            lightdashApi<DocumentVersionList>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/versions?limit=${PAGE_SIZE}&offset=${pageParam}`,
                method: 'GET',
                body: undefined,
                signal,
            }),
        getNextPageParam: (page) => page.nextOffset ?? undefined,
        retry: false,
    });

/** The Document with a historical version's content; versions never change. */
export const useDocumentVersion = (
    projectUuid: string,
    documentUuid: string,
    versionUuid: string | null,
) =>
    useQuery<Document, ApiError>({
        queryKey: ['document-version', projectUuid, documentUuid, versionUuid],
        queryFn: ({ signal }) =>
            lightdashApi<Document>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/versions/${versionUuid}`,
                method: 'GET',
                body: undefined,
                signal,
            }),
        enabled: versionUuid !== null,
        staleTime: Infinity,
        keepPreviousData: true,
        retry: false,
    });
