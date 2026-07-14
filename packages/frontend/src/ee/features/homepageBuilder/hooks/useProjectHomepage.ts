import {
    CommercialFeatureFlags,
    type ApiError,
    type PublishedProjectHomepage,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

const getPublishedHomepage = async (projectUuid: string) =>
    lightdashApi<PublishedProjectHomepage | null>({
        url: `/projects/${projectUuid}/homepage`,
        method: 'GET',
        body: undefined,
    });

export const useHomepageBuilderFlag = () => {
    const { data: flag, isLoading } = useServerFeatureFlag(
        CommercialFeatureFlags.HomepageBuilder,
    );
    return { isEnabled: !!flag?.enabled, isLoading };
};

export const usePublishedHomepage = (
    projectUuid: string | undefined,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<PublishedProjectHomepage | null, ApiError>({
        enabled: !!projectUuid && enabled,
        queryKey: ['project_homepage', projectUuid, 'published'],
        queryFn: () => getPublishedHomepage(projectUuid!),
    });
