import { type FC } from 'react';
import { useVirtualViewAsCode } from '../hooks/useVirtualViewAsCode';
import ContentAsCodeModal from './ContentAsCodeModal';

type VirtualViewAsCodeModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    virtualViewSlug: string;
};

const VirtualViewAsCodeModal: FC<VirtualViewAsCodeModalProps> = ({
    opened,
    onClose,
    projectUuid,
    virtualViewSlug,
}) => {
    const virtualViewAsCode = useVirtualViewAsCode({
        projectUuid,
        virtualViewSlug,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel="virtual view"
            contentAsCode={virtualViewAsCode}
        />
    );
};

export default VirtualViewAsCodeModal;
