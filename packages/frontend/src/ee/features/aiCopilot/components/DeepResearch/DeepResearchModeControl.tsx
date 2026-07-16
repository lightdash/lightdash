import { Button } from '@mantine-8/core';
import { IconReportSearch } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type AgentComposerMode = 'ask' | 'deep_research';

type Props = {
    mode: AgentComposerMode;
    onModeChange: (mode: AgentComposerMode) => void;
};

export const DeepResearchModeControl = ({ mode, onModeChange }: Props) => {
    const isDeepResearch = mode === 'deep_research';

    return (
        <Button
            size="xs"
            variant={isDeepResearch ? 'light' : 'default'}
            color={isDeepResearch ? 'indigo' : 'gray'}
            leftSection={
                <MantineIcon icon={IconReportSearch} size={14} stroke={1.8} />
            }
            onClick={() =>
                onModeChange(isDeepResearch ? 'ask' : 'deep_research')
            }
            aria-pressed={isDeepResearch}
        >
            Deep research
        </Button>
    );
};
