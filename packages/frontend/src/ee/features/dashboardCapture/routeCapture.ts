import {
    type ApiCaptureRouteRequest,
    type CaptureRoute,
} from '@lightdash/common';
import { type LightdashApi } from '../../../api';

/** Asks the server to sort a recording into layout changes and questions. */
export const routeCapture = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    request: ApiCaptureRouteRequest,
): Promise<CaptureRoute> =>
    lightdashApi<CaptureRoute>({
        url: `/org/aiRouter/capture/${projectUuid}`,
        method: 'POST',
        body: JSON.stringify(request),
        // The request carries what the user said and screenshots of the page.
        sensitive: true,
    });
