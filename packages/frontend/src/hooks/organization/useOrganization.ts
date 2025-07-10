import { type ApiError, type Organization } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useEmbed from '../../ee/providers/Embed/useEmbed';

const getOrganization = async (options: {
    headers?: Record<string, string>;
    embedToken?: string;
    projectUuid?: string;
}) =>
    lightdashApi<Organization>({
        url: options.embedToken
            ? `/org?&projectUuid=${options.projectUuid}`
            : `/org`,
        method: 'GET',
        headers: options.headers,
    });

export const useOrganization = (
    useQueryOptions?: UseQueryOptions<Organization, ApiError>,
) => {
    const { embedHeaders, embedToken, projectUuid } = useEmbed();

    return useQuery<Organization, ApiError>({
        queryKey: ['organization'],
        queryFn: () =>
            getOrganization({
                headers: embedHeaders,
                embedToken,
                projectUuid,
            }),
        ...useQueryOptions,
    });
};
