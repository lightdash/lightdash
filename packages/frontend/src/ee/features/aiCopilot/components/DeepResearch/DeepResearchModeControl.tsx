import { ActionIcon, Box, Button, Tooltip } from '@mantine-8/core';
import { IconTelescope } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type AgentComposerMode = 'ask' | 'deep_research';

type Props = {
    mode: AgentComposerMode;
    onModeChange: (mode: AgentComposerMode) => void;
    iconOnly?: boolean;
    actionSize?: number | 'sm' | 'md';
    iconSize?: number;
    disabled?: boolean;
    disabledReason?: string;
};

export const DeepResearchModeControl = ({
    mode,
    onModeChange,
    iconOnly = false,
    actionSize = 'sm',
    iconSize = 14,
    disabled = false,
    disabledReason,
}: Props) => {
    const isDeepResearch = mode === 'deep_research';
    const label = isDeepResearch
        ? 'Disable deep research'
        : 'Enable deep research';
    const toggleMode = () =>
        onModeChange(isDeepResearch ? 'ask' : 'deep_research');

    const control = iconOnly ? (
        <ActionIcon
            variant={isDeepResearch ? 'light' : 'subtle'}
            color={isDeepResearch ? 'indigo' : 'gray'}
            size={actionSize}
            radius="xl"
            onClick={toggleMode}
            aria-label={label}
            aria-pressed={isDeepResearch}
            disabled={disabled}
        >
            <MantineIcon
                icon={IconTelescope}
                size={iconSize}
                stroke={1.8}
                color={isDeepResearch ? 'indigo.5' : 'ldGray.6'}
            />
        </ActionIcon>
    ) : (
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
            disabled={disabled}
        >
            Deep research
        </Button>
    );

    if (!iconOnly && (!disabled || !disabledReason)) {
        return control;
    }

    const tooltipLabel = disabled && disabledReason ? disabledReason : label;

    return (
        <Tooltip
            withArrow
            position="top"
            label={tooltipLabel}
            events={{ hover: true, focus: true, touch: false }}
        >
            <Box
                component="span"
                display="inline-flex"
                tabIndex={disabled ? 0 : undefined}
                aria-label={disabled ? tooltipLabel : undefined}
            >
                {control}
            </Box>
        </Tooltip>
    );
};
