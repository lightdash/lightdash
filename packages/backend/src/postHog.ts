import { FeatureFlags, SessionUser } from '@lightdash/common';
import { PostHog } from 'posthog-node';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logging/logger';

// How long to wait for Posthog to reply (in ms):
const FLAG_CHECK_TIMEOUT = process.env.POSTHOG_CHECK_TIMEOUT
    ? parseInt(process.env.POSTHOG_CHECK_TIMEOUT, 10)
    : 5000; // 5 seconds

export const postHogClient = lightdashConfig.posthog.projectApiKey
    ? new PostHog(lightdashConfig.posthog.projectApiKey, {
          host: lightdashConfig.posthog.apiHost,
      })
    : undefined;

/**
 * Convenience method to check if a feature flag is enabled for a given user.
 *
 * The flag argument should be a member of the FeatureFlags enum defined in `common`.
 */
export async function isFeatureFlagEnabled(
    flag: FeatureFlags,
    user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    {
        throwOnTimeout = false, // New option added here
    }: {
        throwOnTimeout?: boolean;
    } = {},
): Promise<boolean> {
    /** If we don't have a PostHog client instance, we return false for all checks */
    if (!postHogClient) {
        return false;
    }

    /**
     * Create a timeout promise that will reject if the feature flag check
     * Timeout should be cleared if the check resolves before the timeout
     */
    let timeout: NodeJS.Timeout;
    const timeoutPromise = new Promise<boolean>((resolve, reject) => {
        timeout = setTimeout(() => {
            Logger.error(
                `Timeout waiting for a feature flag with Posthog for flag "${flag}"`,
            );
            if (throwOnTimeout) {
                reject(
                    new Error(
                        `Timeout waiting for a feature flag check for flag "${flag}"`,
                    ),
                );
            } else {
                resolve(false);
            }
        }, FLAG_CHECK_TIMEOUT);
    });

    /**
     * Check if this flag is enabled via Posthog. The check must resolve within
     * FLAG_CHECK_TIMEOUT, otherwise we handle it based on throwOnTimeout.
     * If the check resolves before the timeout, we clear the timeout.
     */
    const featureFlagPromise = async () => {
        const result = await postHogClient.isFeatureEnabled(
            flag,
            user.userUuid,
            user.organizationUuid != null
                ? {
                      groups: {
                          organization: user.organizationUuid,
                      },
                  }
                : {},
        );

        clearTimeout(timeout);

        return result;
    };

    try {
        // Await the race between the feature flag promise and the timeout
        const isEnabled = await Promise.race([
            featureFlagPromise,
            timeoutPromise,
        ]);
        // isFeatureEnabled returns boolean | undefined, so we force it into a boolean:
        return !!isEnabled;
    } catch (error) {
        if (throwOnTimeout) {
            // Re-throw the error to be handled by the caller
            throw error;
        }
        // If not throwing on timeout, return false
        return false;
    }
}
