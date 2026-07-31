import {
    type ApiError,
    type ApiHomepageMediaCardsResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const listMediaCards = () =>
    lightdashApi<ApiHomepageMediaCardsResponse['results']>({
        url: '/ee/homepage/media-cards',
        method: 'GET',
        body: undefined,
    });

export const useHomepageMediaCards = () =>
    useQuery<ApiHomepageMediaCardsResponse['results'], ApiError>({
        queryKey: ['homepage-media-cards'],
        queryFn: listMediaCards,
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
    });
