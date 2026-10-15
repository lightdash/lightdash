import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('contentAsCode');
    const virtualViewAsCode = useVirtualViewAsCode({
        projectUuid,
        virtualViewSlug,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel={t('resources.virtualView')}
            contentAsCode={virtualViewAsCode}
        />
    );
};

export default VirtualViewAsCodeModal;
