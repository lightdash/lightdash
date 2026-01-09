import {
    ApiErrorPayload,
    ApiLoomThumbnailResponse,
    ParameterError,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Query,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

const TIMEOUT_MS = 10000;

interface LoomOEmbedResponse {
    thumbnail_url?: string;
    title?: string;
}

@Route('/api/v1/loom')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Loom')
export class LoomController extends BaseController {
    /**
     * Get thumbnail URL for a Loom video using their oEmbed API
     * @param url the Loom share URL
     * @summary Get Loom thumbnail
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/thumbnail')
    @OperationId('getLoomThumbnail')
    async getThumbnail(
        @Query() url: string,
    ): Promise<ApiLoomThumbnailResponse> {
        if (!url) {
            throw new ParameterError('URL parameter is required');
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch (error) {
            throw new ParameterError('Invalid URL format');
        }

        if (!parsedUrl.hostname.includes('loom.com')) {
            throw new ParameterError('URL must be a Loom URL');
        }

        const oembedUrl = `https://www.loom.com/v1/oembed?url=${encodeURIComponent(
            url,
        )}`;

        const response = await fetch(oembedUrl, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new ParameterError(
                `Failed to fetch Loom metadata: ${response.status}`,
            );
        }

        const data: LoomOEmbedResponse = await response.json();

        if (!data.thumbnail_url) {
            throw new ParameterError('No thumbnail available for this video');
        }

        // Convert thumbnail URL to the "-full-play.jpg" variant which includes the play button overlay
        // Original: https://cdn.loom.com/sessions/thumbnails/{id}-{hash}.gif
        // Target:   https://cdn.loom.com/sessions/thumbnails/{id}-{hash}-full-play.jpg
        let thumbnailUrl = data.thumbnail_url;
        const thumbnailMatch = thumbnailUrl.match(
            /^(https:\/\/cdn\.loom\.com\/sessions\/thumbnails\/[^.]+)\.(gif|jpg|png)$/,
        );
        if (thumbnailMatch) {
            thumbnailUrl = `${thumbnailMatch[1]}-full-play.jpg`;
        }

        this.setStatus(200);
        return {
            status: 'ok',
            results: {
                thumbnailUrl,
                title: data.title,
            },
        };
    }
}
