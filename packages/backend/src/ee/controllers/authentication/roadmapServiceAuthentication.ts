import { AuthorizationError, getErrorMessage } from '@lightdash/common';
import { RequestHandler } from 'express';
import Logger from '../../../logging/logger';
import LicenseClient from '../../clients/License/LicenseClient';

export const ROADMAP_LICENSE_KEY_HEADER = 'lightdash-license-key';

// Validated keys are cached by LicenseClient, so repeated calls from the same
// instance don't hit the licensing API on every request.
const licenseClient = new LicenseClient({});

/**
 * Authenticates a request to the central roadmap service using a Lightdash
 * license key (sent by the calling instance in the `lightdash-license-key`
 * header). This is service-to-service auth — it establishes no user session.
 * The calling instance is trusted to request its own organization's roadmap.
 */
export const isRoadmapServiceAuthenticated: RequestHandler = (
    req,
    res,
    next,
) => {
    const licenseKey = req.headers[ROADMAP_LICENSE_KEY_HEADER];
    if (typeof licenseKey !== 'string' || licenseKey.length === 0) {
        next(new AuthorizationError('Missing license key'));
        return;
    }

    licenseClient
        .get(licenseKey)
        .then((license) => {
            if (license.isValid) {
                next();
            } else {
                next(
                    new AuthorizationError(
                        `Invalid license key [${license.code}]`,
                    ),
                );
            }
        })
        .catch((error) => {
            Logger.error(
                `Failed to validate roadmap license key: ${getErrorMessage(error)}`,
            );
            next(new AuthorizationError('Could not validate license key'));
        });
};
