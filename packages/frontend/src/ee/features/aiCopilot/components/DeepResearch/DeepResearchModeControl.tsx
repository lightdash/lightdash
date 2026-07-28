import { Badge, Button, Group } from '@mantine-8/core';
import { IconTelescope } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type AgentComposerMode = 'ask' | 'deep_research';

type Props = {
    mode: AgentComposerMode;
    onModeChange: (mode: AgentComposerMode) => void;
    variant?: 'default' | 'compact';
    classNames?: {
        root?: string;
        label?: string;
    };
};

export const DeepResearchModeControl = ({
    mode,
    onModeChange,
    variant = 'default',
    classNames,
}: Props) => {
    const isDeepResearch = mode === 'deep_research';
    const toggleMode = () =>
        onModeChange(isDeepResearch ? 'ask' : 'deep_research');

    if (variant === 'compact') {
        return (
            <button
                type="button"
                className={classNames?.root}
                onClick={toggleMode}
                aria-label="Deep research"
                aria-pressed={isDeepResearch}
            >
                <MantineIcon icon={IconTelescope} size={15} stroke={1.8} />
                <span className={classNames?.label} aria-hidden="true">
                    Deep research
                </span>
            </button>
        );
    }

    return (
        <Button
            size="xs"
            variant={isDeepResearch ? 'light' : 'subtle'}
            color="blue"
            leftSection={
                <MantineIcon icon={IconTelescope} size={14} stroke={1.8} />
            }
            onClick={toggleMode}
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
