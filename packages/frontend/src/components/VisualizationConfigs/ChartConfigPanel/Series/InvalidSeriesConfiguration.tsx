import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

const InvalidSeriesConfiguration: FC<{ itemId: string }> = ({ itemId }) => {
    const { t } = useTranslation('vizConfig');
    return (
        <Stack>
            <Text c="dimmed">{t('series.invalidField', { itemId })}</Text>
        </Stack>
    );
};

export default InvalidSeriesConfiguration;
