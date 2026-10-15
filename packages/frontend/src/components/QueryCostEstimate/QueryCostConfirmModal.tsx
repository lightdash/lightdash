import { formatEstimatedBytes } from '@lightdash/common';
import { Text } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Callout from '../common/Callout';
import MantineModal from '../common/MantineModal';

type Props = {
    opened: boolean;
    totalBytesProcessed: number;
    confirmEstimatedBytesAbove: number;
    onConfirm: () => void;
    onClose: () => void;
};

export const QueryCostConfirmModal: FC<Props> = ({
    opened,
    totalBytesProcessed,
    confirmEstimatedBytesAbove,
    onConfirm,
    onClose,
}) => {
    const { t } = useTranslation('explorer');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('queryCostConfirmModal.title')}
            icon={IconDatabase}
            role="alertdialog"
            confirmLabel={t('queryCostConfirmModal.confirm')}
            onConfirm={onConfirm}
        >
            <Text fz="sm">
                <Trans
                    t={t}
                    i18nKey="queryCostConfirmModal.body"
                    values={{
                        bytes: formatEstimatedBytes(totalBytesProcessed),
                        threshold: formatEstimatedBytes(
                            confirmEstimatedBytesAbove,
                        ),
                    }}
                    components={{ bytes: <Text span fw={600} fz="sm" /> }}
                />
            </Text>
            <Callout variant="info">{t('queryCostConfirmModal.hint')}</Callout>
        </MantineModal>
    );
};
