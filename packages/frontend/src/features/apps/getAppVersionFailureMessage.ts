type AppVersionFailure = {
    statusMessage: string | null;
    error: string | null;
};

export const getAppVersionFailureMessage = ({
    statusMessage,
    error,
}: AppVersionFailure): string =>
    statusMessage ?? error ?? 'Generation failed. Please try again.';
