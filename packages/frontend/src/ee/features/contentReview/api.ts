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
    type RejectContentReviewRequestBody,
    type UpdateContentReviewSettings,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';

const contentReviewBasePath = (projectUuid: string) =>
    `/projects/${projectUuid}/review-requests`;

export const getPendingContentReviewRequest = (
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
    projectUuid: string,
    body: CreateContentReviewRequestBody,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: contentReviewBasePath(projectUuid),
        method: 'POST',
        body: JSON.stringify(body),
    });

export const cancelContentReviewRequest = (
    projectUuid: string,
    requestUuid: string,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/${requestUuid}/cancel`,
        method: 'POST',
        body: undefined,
    });

export const listContentReviewRequests = (
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
    projectUuid: string,
    requestUuid: string,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/${requestUuid}`,
        method: 'GET',
        body: undefined,
    });

export const approveContentReviewRequest = (
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
    projectUuid: string,
    requestUuid: string,
    body: RejectContentReviewRequestBody,
) =>
    lightdashApi<ApiContentReviewRequestResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/${requestUuid}/reject`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const getContentReviewSettings = (projectUuid: string) =>
    lightdashApi<ApiContentReviewSettingsResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/settings`,
        method: 'GET',
        body: undefined,
    });

export const updateContentReviewSettings = (
    projectUuid: string,
    body: UpdateContentReviewSettings,
) =>
    lightdashApi<ApiContentReviewSettingsResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/settings`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const getSimilarContentForReview = (
    projectUuid: string,
    params: {
        contentType: ContentReviewContentType;
        name: string;
        excludeContentUuid: string;
    },
) => {
    const search = new URLSearchParams({
        contentType: params.contentType,
        name: params.name,
        excludeContentUuid: params.excludeContentUuid,
    });
    return lightdashApi<ApiContentReviewSimilarContentResponse['results']>({
        url: `${contentReviewBasePath(projectUuid)}/similar?${search.toString()}`,
        method: 'GET',
        body: undefined,
    });
};
