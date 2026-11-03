import type { StorybookConfig } from '@storybook/react-vite';
import { feedbackPlugin } from './feedbackPlugin';

const config: StorybookConfig = {
    stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    addons: [
        '@storybook/addon-docs',
        '@storybook/addon-onboarding',
        '@chromatic-com/storybook',
    ],
    framework: '@storybook/react-vite',
    typescript: {
        reactDocgen: false,
    },
    viteFinal: async (viteConfig) => ({
        ...viteConfig,
        plugins: [...(viteConfig.plugins ?? []), feedbackPlugin()],
    }),
};
export default config;
