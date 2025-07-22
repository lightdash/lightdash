import { useMemo } from 'react';
import useHealth from '../../../hooks/health/useHealth';

export const useExpireOptions = (includeNoExpiration = false) => {
    const health = useHealth();

    return useMemo(() => {
        const options = [
            {
                label: 'No expiration',
                value: '',
            },
            {
                label: '7 days',
                value: '7',
            },
            {
                label: '30 days',
                value: '30',
            },
            {
                label: '60 days',
                value: '60',
            },
            {
                label: '90 days',
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
    }, [health.data?.auth.pat.maxExpirationTimeInDays, includeNoExpiration]);
};
