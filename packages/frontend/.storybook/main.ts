import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
    addons: [
        '@storybook/addon-docs',
        '@storybook/addon-onboarding',
        '@chromatic-com/storybook',
    ],
    framework: '@storybook/react-vite',
};
export default config;
