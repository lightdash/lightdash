import { Badge, Button, Group } from '@mantine-8/core';
import { IconTelescope } from '@tabler/icons-react';
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
            variant={isDeepResearch ? 'light' : 'subtle'}
            color="blue"
            leftSection={
                <MantineIcon icon={IconTelescope} size={14} stroke={1.8} />
            }
            onClick={() =>
                onModeChange(isDeepResearch ? 'ask' : 'deep_research')
            }
            aria-label="Deep research"
            aria-pressed={isDeepResearch}
        >
            <Group gap={5} wrap="nowrap">
                Deep research
                <Badge size="xs" variant="light" color="blue" tt="none">
                    Beta
                </Badge>
            </Group>
        </Button>
    );
};
