import { type DocumentAsCode, type UuidOrSlug } from '@lightdash/common';
import { lightdashApi } from '../../api';
import { useContentAsCode } from '../contentAsCode/hooks/useContentAsCode';

const selectDocument = (document: DocumentAsCode) => document;

export const useDocumentAsCode = (
    projectUuid: string,
    documentUuidOrSlug: UuidOrSlug,
    enabled: boolean,
) =>
    useContentAsCode({
        queryKey: ['document-as-code', projectUuid, documentUuidOrSlug],
        queryFn: () =>
            lightdashApi<DocumentAsCode>({
                url: `/projects/${projectUuid}/documents/${documentUuidOrSlug}/as-code`,
                method: 'GET',
                body: undefined,
            }),
        selectDocument,
        enabled,
    });
