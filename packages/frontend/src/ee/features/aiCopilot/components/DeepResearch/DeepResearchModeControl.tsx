import { ActionIcon, Button, Tooltip } from '@mantine-8/core';
import { IconTelescope } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type AgentComposerMode = 'ask' | 'deep_research';

type Props = {
    mode: AgentComposerMode;
    onModeChange: (mode: AgentComposerMode) => void;
    iconOnly?: boolean;
    actionSize?: number | 'sm' | 'md';
    iconSize?: number;
};

export const DeepResearchModeControl = ({
    mode,
    onModeChange,
    iconOnly = false,
    actionSize = 'sm',
    iconSize = 14,
}: Props) => {
    const isDeepResearch = mode === 'deep_research';
    const label = isDeepResearch
        ? 'Turn off Deep research'
        : 'Turn on Deep research';
    const toggleMode = () =>
        onModeChange(isDeepResearch ? 'ask' : 'deep_research');

    if (iconOnly) {
        return (
            <Tooltip withArrow position="top" label={label}>
                <ActionIcon
                    variant={isDeepResearch ? 'light' : 'subtle'}
                    color={isDeepResearch ? 'indigo' : 'gray'}
                    size={actionSize}
                    radius="xl"
                    onClick={toggleMode}
                    aria-label={label}
                    aria-pressed={isDeepResearch}
                >
                    <MantineIcon
                        icon={IconTelescope}
                        size={iconSize}
                        stroke={1.8}
                        color={isDeepResearch ? 'indigo.5' : 'ldGray.6'}
                    />
                </ActionIcon>
            </Tooltip>
        );
    }

    return (
        <Button
            pl="xs"
            pr="xs"
            size="xs"
            radius="xl"
            variant={isDeepResearch ? 'light' : 'subtle'}
            color={isDeepResearch ? 'indigo' : 'gray'}
            leftSection={
                <MantineIcon icon={IconTelescope} size={14} stroke={1.8} />
            }
            onClick={toggleMode}
            aria-label={label}
            aria-pressed={isDeepResearch}
        >
            Deep research
        </Button>
    );
};
