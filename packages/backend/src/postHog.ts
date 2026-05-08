import { PostHog } from 'posthog-node';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logging/logger';

export const postHogClient = lightdashConfig.posthog
    ? new PostHog(lightdashConfig.posthog.projectApiKey, {
          host: lightdashConfig.posthog.beApiHost,
      })
    : undefined;

postHogClient?.on('error', (err) => {
    // Logging the error for debugging purposes
    Logger.error('PostHog Error Event', err);
});
