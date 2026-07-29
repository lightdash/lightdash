import { Button } from '@mantine-8/core';
import { IconTelescope } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type AgentComposerMode = 'ask' | 'deep_research';

type Props = {
    mode: AgentComposerMode;
    onModeChange: (mode: AgentComposerMode) => void;
};

export const DeepResearchModeControl = ({ mode, onModeChange }: Props) => {
    const isDeepResearch = mode === 'deep_research';
    const toggleMode = () =>
        onModeChange(isDeepResearch ? 'ask' : 'deep_research');

    return (
        <Button
            size="compact-xs"
            radius="xl"
            variant={isDeepResearch ? 'light' : 'subtle'}
            color={isDeepResearch ? 'blue' : 'gray'}
            leftSection={
                <MantineIcon icon={IconTelescope} size={14} stroke={1.8} />
            }
            onClick={toggleMode}
            aria-label="Deep research"
            aria-pressed={isDeepResearch}
        >
            Deep research
        </Button>
    );
};
