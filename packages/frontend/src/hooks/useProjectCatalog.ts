import { type ApiError, type ProjectCatalog } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom-v5-compat';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getProjectCatalogQuery = async (projectUuid: string) =>
    lightdashApi<ProjectCatalog>({
        url: `/projects/${projectUuid}/catalog`,
        method: 'GET',
        body: undefined,
    });

export const useProjectCatalog = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    return useQuery<ProjectCatalog, ApiError>({
        queryKey: ['projectCatalog', projectUuid],
        queryFn: () =>
            projectUuid
                ? getProjectCatalogQuery(projectUuid)
                : Promise.reject(),
        onError: (result) => setErrorResponse(result),
    });
};
