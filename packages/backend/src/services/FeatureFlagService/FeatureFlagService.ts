import { SessionUser } from '@lightdash/common';
import { PostHog } from 'posthog-node';
import Logger from '../../logging/logger';
import { postHogClient } from '../../postHog';
import { FeatureFlags } from './FeatureFlags';

interface FeatureFlagCheckArguments {
    flag: FeatureFlags;
    user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>;
}

type FeatureFlagCheckMockFn = (
    checkProps: FeatureFlagCheckArguments,
) => boolean;

export class FeatureFlagService {
    private postHog?: PostHog;

    private mockFn?: FeatureFlagCheckMockFn;

    constructor({
        postHog = postHogClient,
        mockFn,
    }: {
        postHog?: PostHog;

        /**
         * If defined, is used as a mock function to check if a feature flag
         * is enabled, instead of reaching out to Posthog.
         */
        mockFn?: FeatureFlagCheckMockFn;
    } = {}) {
        this.postHog = postHog;
        this.mockFn = mockFn;
    }

    public async isFeatureFlagEnabled({
        flag,
        user,
    }: FeatureFlagCheckArguments) {
        /**
         * If we have a mock function, we don't even attempt to reach out to Posthog, and
         * short-circuit directly to its output, while logging the action:
         */
        if (this.mockFn) {
            Logger.debug(`Checking for feature flag '${flag}' with mock`);
            return this.mockFn({ flag, user });
        }

        // If we don't have a postHog client, we treat every check as falsy.
        if (!this.postHog) {
            return false;
        }

        const isEnabled = await this.postHog.isFeatureEnabled(
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

        // isFeatureEnabled returns boolean | undefined, so we force it into a boolean:
        return !!isEnabled;
    }

    /**
     * Returns the postHog client in use by this instance, if any.
     */
    public getPosthogClient() {
        return this.postHog;
    }

    /**
     * Returns true if the results of this instance are being mocked, and not
     * based on real data from postHog.
     */
    public isUsingMockedResults() {
        return this.mockFn != null;
    }

    /**
     * Static convenience method around FeatureFlagService.isFeatureFlagEnabled. The second
     * optional argument can be optionally used to set a mockFn for testing (but not override
     * postHogClient - if you need to do that, you should consider instantiating the class
     * instead)
     */
    public static async isFeatureFlagEnabled(
        checkArgs: FeatureFlagCheckArguments,
        { mockFn }: { mockFn?: FeatureFlagCheckMockFn } = {},
    ) {
        return new FeatureFlagService({ mockFn }).isFeatureFlagEnabled(
            checkArgs,
        );
    }
}
