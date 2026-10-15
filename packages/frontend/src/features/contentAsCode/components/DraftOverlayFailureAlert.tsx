import { Alert, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';

type DraftOverlayFailureAlertProps = {
    error: { code: string; draftUuid: string };
    contentType?: 'dashboard' | 'chart';
};

const DraftOverlayFailureAlert: FC<DraftOverlayFailureAlertProps> = ({
    error,
    contentType = 'dashboard',
}) => {
    const { t } = useTranslation('contentAsCode');
    return (
        <Alert
            color="orange"
            icon={<MantineIcon icon={IconAlertTriangle} />}
            title={t('overlayFailure.title')}
            mx="md"
            mt="md"
            data-draft-error={error.code}
        >
            <Text size="sm">
                {t('overlayFailure.description', { context: contentType })}
            </Text>
        </Alert>
    );
};

export default DraftOverlayFailureAlert;
