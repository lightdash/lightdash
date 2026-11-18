import {
    type ApiCaptureRouteRequest,
    type ApiCaptureRouteResponse,
    type CaptureRoute,
} from '@lightdash/common';

/** Asks the server to sort a capture into layout changes and questions. */
export const routeCapture = async (
    projectUuid: string,
    request: ApiCaptureRouteRequest,
): Promise<CaptureRoute> => {
    const response = await fetch(
        `/api/v1/org/aiRouter/capture/${projectUuid}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        },
    );
    if (!response.ok) {
        throw new Error(`Routing failed: ${response.status}`);
    }
    const json = (await response.json()) as ApiCaptureRouteResponse;
    return json.results;
};
