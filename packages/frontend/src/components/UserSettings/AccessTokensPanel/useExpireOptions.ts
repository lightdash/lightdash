import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useHealth from '../../../hooks/health/useHealth';

export const useExpireOptions = (includeNoExpiration = false) => {
    const { t } = useTranslation('userSettings');
    const health = useHealth();

    return useMemo(() => {
        const options = [
            {
                label: t('accessTokensPanel.expireOptions.noExpiration'),
                value: '',
            },
            {
                label: t('accessTokensPanel.expireOptions.days', { count: 7 }),
                value: '7',
            },
            {
                label: t('accessTokensPanel.expireOptions.days', { count: 30 }),
                value: '30',
            },
            {
                label: t('accessTokensPanel.expireOptions.days', { count: 60 }),
                value: '60',
            },
            {
                label: t('accessTokensPanel.expireOptions.days', { count: 90 }),
                value: '90',
            },
        ];

        const maxExpirationTimeInDays =
            health.data?.auth.pat.maxExpirationTimeInDays;

        return options.filter((option) => {
            if (option.value === '') {
                return includeNoExpiration;
            }
            if (!maxExpirationTimeInDays) return true;
            return parseFloat(option.value) <= maxExpirationTimeInDays;
        });
    }, [health.data?.auth.pat.maxExpirationTimeInDays, includeNoExpiration, t]);
};
