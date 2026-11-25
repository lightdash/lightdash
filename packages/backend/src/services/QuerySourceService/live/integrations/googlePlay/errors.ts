import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    TooManyRequestsError,
    WarehouseConnectionError,
    type GooglePlayApiSource,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../types';
import { toGoogleApiError } from '../google/errors';

const LABEL =
    LIVE_INTEGRATION_CATALOG[ApiConnectorType.GOOGLE_PLAY].messageLabel;

const messageSchema = z.object({
    error: z.object({ message: z.string() }),
});

/** Google's errors, with advice for a service account invited to Play Console. */
export const toGooglePlayError = (
    response: LiveHttpResponse,
    { packageName }: Pick<GooglePlayApiSource, 'packageName'>,
): Error => {
    const error = toGoogleApiError(response, {
        label: LABEL,
        resource: packageName,
    });
    if (
        (response.status !== 401 && response.status !== 403) ||
        error instanceof TooManyRequestsError
    ) {
        return error;
    }
    const parsed = messageSchema.safeParse(response.body);
    const detail = parsed.success ? `: ${parsed.data.error.message}` : '';
    return new WarehouseConnectionError(
        `Google denied access to ${packageName}${detail}. Check that the service account has the 'View app information and download bulk reports' permission in Play Console and that the Google Play Developer Reporting API is enabled in its Google Cloud project.`,
    );
};
