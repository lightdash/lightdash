import { ApiError } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getFieldValues = async (
    projectId: string,
    fieldId: string,
    value: string,
    limit: number,
) =>
    lightdashApi<Array<any>>({
        url: `/projects/${projectId}/field/${fieldId}/search?value=${encodeURIComponent(
            value,
        )}&limit=${limit}`,
        method: 'GET',
        body: undefined,
    });

export const useFieldValues = (
    projectId: string,
    fieldId: string,
    search: string,
    limit: number,
    enabled: boolean,
) => {
    return useQuery<Array<any>, ApiError>({
        queryKey: ['project', projectId, fieldId, search],
        queryFn: () => getFieldValues(projectId, fieldId, search, limit),
        enabled: enabled,
    });
};
