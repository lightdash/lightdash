import { Alert, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';

export const SqlQueryBeforeSaveAlert: FC<{ withDescription?: boolean }> = ({
    withDescription = true,
}) => {
    const { t } = useTranslation('sqlRunner');
    return (
        <Alert
            icon={<MantineIcon icon={IconAlertCircle} />}
            color="orange"
            title={t('beforeSaveAlert.title')}
        >
            {withDescription && (
                <Text fw={500} fz="xs">
                    {t('beforeSaveAlert.description')}
                </Text>
            )}
        </Alert>
    );
};
