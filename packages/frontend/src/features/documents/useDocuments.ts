import { type ApiError, type DocumentList } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

export const DOCUMENT_PAGE_SIZE = 50;

export const useDocuments = (projectUuid: string, offset: number) =>
    useQuery<DocumentList, ApiError>({
        queryKey: [
            'documents',
            projectUuid,
            { offset, limit: DOCUMENT_PAGE_SIZE },
        ],
        queryFn: ({ signal }) =>
            lightdashApi<DocumentList>({
                url: `/projects/${projectUuid}/documents?limit=${DOCUMENT_PAGE_SIZE}&offset=${offset}`,
                method: 'GET',
                body: undefined,
                signal,
            }),
        retry: false,
    });
