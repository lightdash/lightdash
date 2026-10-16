import { Badge } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

export const ServiceAccountBadge: FC = () => {
    const { t } = useTranslation('modals');
    return (
        <Badge size="xs" color="violet">
            {t('shareSpace.serviceAccount')}
        </Badge>
    );
};
