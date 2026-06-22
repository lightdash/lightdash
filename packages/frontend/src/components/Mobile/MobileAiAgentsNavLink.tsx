import { type FC } from 'react';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { useAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import RouterNavLink from '../common/RouterNavLink';

type Props = {
    activeProjectUuid: string | undefined;
    onClick: () => void;
};

const MobileAiAgentsNavLink: FC<Props> = ({ activeProjectUuid, onClick }) => {
    const isVisible = useAiAgentButtonVisibility();

    if (!isVisible) return null;

    return (
        <RouterNavLink
            exact
            label="Ask AI"
            to={`/projects/${activeProjectUuid}/ai-agents`}
            leftSection={<AiAgentIcon size={16} />}
            onClick={onClick}
        />
    );
};

export default MobileAiAgentsNavLink;
