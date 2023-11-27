import { PostHog } from 'posthog-node';
import { lightdashConfig } from './config/lightdashConfig';

export const postHogClient = new PostHog(
    lightdashConfig.posthog.projectApiKey,
    {
        host: lightdashConfig.posthog.apiHost,
    },
);
