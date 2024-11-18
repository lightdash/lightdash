import { FeatureFlags, SessionUser } from '@lightdash/common';
import { PostHog } from 'posthog-node';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logging/logger';

// How long to wait for Posthog to reply (in ms):
const FLAG_CHECK_TIMEOUT = process.env.POSTHOG_CHECK_TIMEOUT
    ? parseInt(process.env.POSTHOG_CHECK_TIMEOUT, 10)
    : 5000; // 5 seconds by default

export const postHogClient = lightdashConfig.posthog
    ? new PostHog(lightdashConfig.posthog.projectApiKey, {
          host: lightdashConfig.posthog.beApiHost,
      })
    : undefined;

postHogClient?.on('error', (err) => {
    // Logging the error for debugging purposes
    Logger.error('PostHog Error Event', err);
});

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
        timeoutMilliseconds = FLAG_CHECK_TIMEOUT,
    }: {
        throwOnTimeout?: boolean;
        timeoutMilliseconds?: number;
    } = {},
    defaultValue: boolean = false,
): Promise<boolean> {
    /** If we don't have a PostHog client instance, we return false for all checks */
    if (!postHogClient) {
        Logger.warn(
            'PostHog: client not found, check PostHog related environment variables',
        );
        return defaultValue;
    }

    /**
     * Create a timeout promise that will reject if the feature flag check
     * Timeout should be cleared if the check resolves before the timeout
     */
    let timeout: NodeJS.Timeout;
    const timeoutPromise = () =>
        new Promise<boolean>((resolve, reject) => {
            timeout = setTimeout(() => {
                if (throwOnTimeout) {
                    Logger.error(
                        `Timeout waiting for a feature flag with Posthog for flag "${flag}"`,
                    );

                    reject(
                        new Error(
                            `Timeout waiting for a feature flag check for flag "${flag}"`,
                        ),
                    );
                } else {
                    Logger.error(
                        `Silently ignoring timeout waiting for a feature flag with Posthog for flag "${flag}"`,
                    );

                    resolve(defaultValue);
                }
            }, timeoutMilliseconds);
        });

    /**
     * Check if this flag is enabled via Posthog. The check must resolve within
     * timeoutMilliseconds, otherwise we handle it based on throwOnTimeout.
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

    const isEnabled = await Promise.race([
        timeoutPromise(),
        featureFlagPromise(),
    ]);
    // isFeatureEnabled returns boolean | undefined, so we return a boolean, or defaultValue:
    return isEnabled ?? defaultValue;
}
