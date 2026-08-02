import { type FC } from 'react';
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
    const scheduledDeliveryAsCode = useScheduledDeliveryAsCode({
        projectUuid,
        deliverySlug,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel="scheduled delivery"
            contentAsCode={scheduledDeliveryAsCode}
            warning={scheduledDeliveryAsCode.data?.skipped[0]?.reason}
        />
    );
};

export default ScheduledDeliveryAsCodeModal;
