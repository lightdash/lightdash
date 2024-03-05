import { FeatureFlags, SessionUser } from '@lightdash/common';
import { PostHog } from 'posthog-node';
import { lightdashConfig } from './config/lightdashConfig';

// How long to wait for Posthog to reply (in ms):
const FLAG_CHECK_TIMEOUT = process.env.POSTHOG_CHECK_TIMEOUT
    ? parseInt(process.env.POSTHOG_CHECK_TIMEOUT, 10)
    : 500; /* ms */

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
        postHog = postHogClient,
    }: {
        postHog?: PostHog;
    } = {},
): Promise<boolean> {
    /** If we don't have a PostHog client instance, we return false for all checks */
    if (!postHog) {
        return false;
    }

    /**
     * Check if this flag is enabled via Posthog. The check must resolve within
     * FLAG_CHECK_TIMEOUT, otherwise we return false.
     */
    const isEnabled = await Promise.race([
        postHog.isFeatureEnabled(
            flag,
            user.userUuid,
            user.organizationUuid != null
                ? {
                      groups: {
                          organization: user.organizationUuid,
                      },
                  }
                : {},
        ),
        new Promise<boolean>((resolve) => {
            setTimeout(() => {
                resolve(false);
            }, FLAG_CHECK_TIMEOUT);
        }),
    ]);

    // isFeatureEnabled returns boolean | undefined, so we force it into a boolean:
    return !!isEnabled;
}
