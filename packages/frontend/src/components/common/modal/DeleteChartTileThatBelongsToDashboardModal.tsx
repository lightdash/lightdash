import { type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../Callout';
import MantineModal from '../MantineModal';

interface Props extends ModalProps {
    name: string;
    onConfirm: () => void;
    className?: string;
}

const DeleteChartTileThatBelongsToDashboardModal: FC<Props> = ({
    opened,
    onClose,
    name,
    onConfirm,
    className,
}) => {
    const { t } = useTranslation('modals');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('deleteChartTile.title')}
            variant="delete"
            resourceType={t('resourceTypes.chart')}
            resourceLabel={name}
            modalRootProps={{ className }}
            onConfirm={onConfirm}
        >
            <Callout variant="warning" title={t('cannotBeUndone')}>
                {t('deleteChartTile.warning')}
            </Callout>
        </MantineModal>
    );
};

export default DeleteChartTileThatBelongsToDashboardModal;
