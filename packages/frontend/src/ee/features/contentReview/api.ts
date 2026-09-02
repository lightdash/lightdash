import {
    type ApiContentReviewRequestOrNullResponse,
    type ApiContentReviewRequestResponse,
    type ContentReviewContentType,
    type CreateContentReviewRequestBody,
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
