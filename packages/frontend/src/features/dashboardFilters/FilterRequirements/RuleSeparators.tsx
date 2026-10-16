import { Divider, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

export const AndSeparator: FC = () => {
    const { t } = useTranslation('dashboardFilters');
    return (
        <Divider
            label={
                <Text size="10px" fw={600} c="dimmed">
                    {t('requirements.and')}
                </Text>
            }
            labelPosition="center"
        />
    );
};

export const OrSeparator: FC = () => {
    const { t } = useTranslation('dashboardFilters');
    return (
        <Divider
            label={
                <Text size="10px" fw={500} c="ldGray.5">
                    {t('requirements.or')}
                </Text>
            }
            labelPosition="center"
        />
    );
};
