import { type FC } from 'react';
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
    const aiAgentAsCode = useAiAgentAsCode({
        projectUuid,
        agentUuid,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel="AI agent"
            contentAsCode={aiAgentAsCode}
        />
    );
};

export default AiAgentAsCodeModal;
