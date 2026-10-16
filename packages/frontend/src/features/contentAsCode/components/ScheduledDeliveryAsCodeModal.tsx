import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useScheduledDeliveryAsCode } from '../hooks/useScheduledDeliveryAsCode';
import ContentAsCodeModal from './ContentAsCodeModal';

type ScheduledDeliveryAsCodeModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    deliverySlug: string;
};

const ScheduledDeliveryAsCodeModal: FC<ScheduledDeliveryAsCodeModalProps> = ({
    opened,
    onClose,
    projectUuid,
    deliverySlug,
}) => {
    const { t } = useTranslation('contentAsCode');
    const scheduledDeliveryAsCode = useScheduledDeliveryAsCode({
        projectUuid,
        deliverySlug,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel={t('resources.scheduledDelivery')}
            contentAsCode={scheduledDeliveryAsCode}
            warning={scheduledDeliveryAsCode.data?.skipped[0]?.reason}
        />
    );
};

export default ScheduledDeliveryAsCodeModal;
