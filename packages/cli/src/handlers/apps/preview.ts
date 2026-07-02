export const buildPreviewEnv = (args: {
    serverUrl: string;
    apiKey: string;
    projectUuid: string;
}): string => {
    const baseUrl = args.serverUrl.replace(/\/+$/, '');
    return [
        `VITE_LIGHTDASH_URL=${baseUrl}`,
        `VITE_LIGHTDASH_API_KEY=${args.apiKey}`,
        `VITE_LIGHTDASH_PROJECT_UUID=${args.projectUuid}`,
        '',
    ].join('\n');
};
