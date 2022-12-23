import { ApiError, DbtCloudMetadataResponseMetrics } from '@lightdash/common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const get = async (projectUuid: string) =>
    lightdashApi<DbtCloudMetadataResponseMetrics>({
        url: `/projects/${projectUuid}/integrations/dbt-cloud/metrics`,
        method: 'GET',
        body: undefined,
    });

export const useProjectDbtCloudMetrics = () => {
    const { projectUuid } = useParams<{ projectUuid?: string }>();
    if (projectUuid === undefined) {
        throw new Error(
            'Must use useProjectDbtCloudMetrics hook under react-router path with projectUuid available',
        );
    }
    return useQuery<DbtCloudMetadataResponseMetrics, ApiError>({
        queryKey: ['dbt-cloud', projectUuid],
        queryFn: () => get(projectUuid),
        onError: useQueryError(),
    });
};
