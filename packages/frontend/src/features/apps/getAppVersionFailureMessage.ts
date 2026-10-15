import i18n from '../../i18n/i18n';

type AppVersionFailure = {
    statusMessage: string | null;
    error: string | null;
};

export const getAppVersionFailureMessage = ({
    statusMessage,
    error,
}: AppVersionFailure): string =>
    statusMessage ?? error ?? i18n.t('generation.failed', { ns: 'apps' });
