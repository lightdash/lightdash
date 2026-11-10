import {
    type ApiContentReviewRequestListResponse,
    type ApiContentReviewRequestOrNullResponse,
    type ApiContentReviewRequestResponse,
    type ApiContentReviewSettingsResponse,
    type ApiContentReviewSimilarContentResponse,
    type ApproveContentReviewRequestBody,
    type ContentReviewContentType,
    type ContentReviewRequestStatus,
    type ContentReviewRequestView,
    type CreateContentReviewRequestBody,
    type FindSimilarContentBody,
    type RejectContentReviewRequestBody,
    type UpdateContentReviewSettings,
} from '@lightdash/common';
import { type LightdashApi } from '../../../api';

const contentReviewBasePath = (projectUuid: string) =>
    `/projects/${projectUuid}/review-requests`;

export const getPendingContentReviewRequest = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    contentType: ContentReviewContentType,
    contentUuid: string,
) =>
    lightdashApi<ApiContentReviewRequestOrNullResponse['results']>({
        url: `${contentReviewBasePath(
            projectUuid,
        )}/content/${contentType}/${contentUuid}`,
        method: 'GET',
        body: undefined,
    });

export const createContentReviewRequest = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    body: CreateContentReviewRequestBody,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: contentReviewBasePath(projectUuid),
        method: 'POST',
        body: JSON.stringify(body),
    });

export const cancelContentReviewRequest = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    requestUuid: string,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/${requestUuid}/cancel`,
        method: 'POST',
        body: undefined,
    });

export const listContentReviewRequests = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    params: {
        view: ContentReviewRequestView;
        status: ContentReviewRequestStatus | null;
        page: number;
        pageSize: number;
    },
) => {
    const search = new URLSearchParams({
        view: params.view,
        page: String(params.page),
        pageSize: String(params.pageSize),
    });
    if (params.status !== null) search.set('status', params.status);
    return lightdashApi<ApiContentReviewRequestListResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}?${search.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

export const getContentReviewRequest = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    requestUuid: string,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/${requestUuid}`,
        method: 'GET',
        body: undefined,
    });

export const approveContentReviewRequest = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    requestUuid: string,
    body: ApproveContentReviewRequestBody,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/${requestUuid}/approve`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const rejectContentReviewRequest = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    requestUuid: string,
    body: RejectContentReviewRequestBody,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/${requestUuid}/reject`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const getContentReviewSettings = (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiContentReviewSettingsResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/settings`,
        method: 'GET',
        body: undefined,
    });

export const updateContentReviewSettings = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    body: UpdateContentReviewSettings,
) =>
    lightdashApi<ApiContentReviewSettingsResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/settings`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const getSimilarContentForReview = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    params: FindSimilarContentBody,
    signal?: AbortSignal,
) =>
    lightdashApi<ApiContentReviewSimilarContentResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/similar`,
        method: 'POST',
        body: JSON.stringify(params),
        signal,
    });
