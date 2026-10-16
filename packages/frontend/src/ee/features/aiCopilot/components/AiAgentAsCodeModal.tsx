import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import ContentAsCodeModal from '../../../../features/contentAsCode/components/ContentAsCodeModal';
import { useAiAgentAsCode } from '../hooks/useAiAgentAsCode';

type AiAgentAsCodeModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    agentUuid: string;
};

const AiAgentAsCodeModal: FC<AiAgentAsCodeModalProps> = ({
    opened,
    onClose,
    projectUuid,
    agentUuid,
}) => {
    const { t } = useTranslation('aiAgent');
    const aiAgentAsCode = useAiAgentAsCode({
        projectUuid,
        agentUuid,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel={t('sqlApproval.defaultAgentName')}
            contentAsCode={aiAgentAsCode}
        />
    );
};

export default AiAgentAsCodeModal;
