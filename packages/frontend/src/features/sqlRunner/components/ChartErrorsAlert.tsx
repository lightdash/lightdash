import { Button } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    onFixButtonClick: () => void;
};

export const ChartErrorsAlert: FC<Props> = ({
    opened,
    onClose,
    onFixButtonClick,
}) => {
    const { t } = useTranslation('sqlRunner');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('chartErrors.title')}
            icon={IconAlertCircle}
            cancelLabel={false}
            actions={
                <Button size="xs" variant="default" onClick={onFixButtonClick}>
                    {t('chartErrors.fixErrors')}
                </Button>
            }
            description={t('chartErrors.description')}
        ></MantineModal>
    );
};
