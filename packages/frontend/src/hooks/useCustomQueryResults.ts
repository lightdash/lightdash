import {
    ApiError,
    ApiQueryResults,
    Explore,
    MetricQuery,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';

const getCustomSqlQueryResults = (props: {
    projectUuid: string;
    metricQuery: MetricQuery;
    explore: Explore;
}) => {
    return lightdashApi<ApiQueryResults>({
        url: `/projects/${props.projectUuid}/explores/runCustomExploreQuery`,
        method: 'POST',
        body: JSON.stringify({
            metricQuery: props.metricQuery,
            explore: props.explore,
            csvLimit: 100,
        }),
    });
};

export const useCustomSqlQueryResults = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    // TODO: better key,
    return useMutation<
        ApiQueryResults,
        ApiError,
        { metricQuery: MetricQuery; explore: Explore }
    >({
        mutationKey: ['customSqlQuery'],
        mutationFn: (props) =>
            getCustomSqlQueryResults({
                projectUuid,
                ...props,
            }),
    });
};
