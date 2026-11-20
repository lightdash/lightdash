import { FeatureFlags, getErrorMessage } from '@lightdash/common';
import { type RequestHandler } from 'express';
import Logger from '../../logging/logger';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';

const PERMISSIONS_POLICY_HEADER = 'Permissions-Policy';

/** Flags whose surfaces record the user's voice on the page itself. */
const VOICE_DESIGN_FLAGS: string[] = [
    FeatureFlags.DataAppCapture,
    FeatureFlags.DashboardCapture,
];

/**
 * Value of the Permissions-Policy header. The camera is always off. The
 * microphone is off unless the page is allowed to record for Voice Design.
 */
export const permissionsPolicyHeader = ({
    microphoneEnabled,
}: {
    microphoneEnabled: boolean;
}): string => `camera=(), microphone=${microphoneEnabled ? '(self)' : '()'}`;

/** Every response blocks the camera and the microphone unless a later handler allows more. */
export const setDefaultPermissionsPolicy: RequestHandler = (
    _req,
    res,
    next,
) => {
    res.setHeader(
        PERMISSIONS_POLICY_HEADER,
        permissionsPolicyHeader({ microphoneEnabled: false }),
    );
    next();
};

/**
 * Whether the signed-in user's organisation has Voice Design on. Signed-out
 * users and failed lookups get no microphone.
 */
const canUseMicrophone = async (
    user: Express.User | undefined,
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
): Promise<boolean> => {
    if (!user?.organizationUuid) return false;
    try {
        const flags = await Promise.all(
            VOICE_DESIGN_FLAGS.map((featureFlagId) =>
                featureFlagModel.get({
                    user: {
                        userUuid: user.userUuid,
                        organizationUuid: user.organizationUuid,
                    },
                    featureFlagId,
                }),
            ),
        );
        return flags.some(({ enabled }) => enabled);
    } catch (error) {
        Logger.warn(
            `Could not check Voice Design flags for the page: ${getErrorMessage(error)}`,
        );
        return false;
    }
};

/**
 * Serves the app's HTML page. The Permissions-Policy of a page is fixed when
 * it loads, so this is where the microphone is allowed for Voice Design: only
 * on the page document, only for an organisation with the feature on.
 */
export const createSpaIndexHandler = ({
    indexPath,
    featureFlagModel,
}: {
    indexPath: string;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
}): RequestHandler =>
    async function serveSpaIndex(req, res) {
        const microphoneEnabled = await canUseMicrophone(
            req.user,
            featureFlagModel,
        );
        res.setHeader(
            PERMISSIONS_POLICY_HEADER,
            permissionsPolicyHeader({ microphoneEnabled }),
        );
        res.sendFile(indexPath, {
            headers: { 'Cache-Control': 'no-cache, private' },
        });
    };
