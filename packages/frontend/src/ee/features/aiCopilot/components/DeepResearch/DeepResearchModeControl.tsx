import {
    Box,
    Button,
    Divider,
    Popover,
    SegmentedControl,
    Text,
    type PopoverProps,
} from '@mantine-8/core';
import { IconChevronDown, IconTelescope } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type AgentComposerMode = 'ask' | 'deep_research';

type Props = {
    mode: AgentComposerMode;
    onModeChange: (mode: AgentComposerMode) => void;
    settings: ReactNode;
    position?: PopoverProps['position'];
};

export const DeepResearchModeControl = ({
    mode,
    onModeChange,
    settings,
    position = 'top-end',
}: Props) => {
    const isDeepResearch = mode === 'deep_research';
    const [isOpen, setIsOpen] = useState(false);

    const handleTargetClick = () => {
        if (!isDeepResearch) {
            onModeChange('deep_research');
        }
        setIsOpen((current) => !current);
    };

    const handleModeChange = (value: string) => {
        const nextMode = value as AgentComposerMode;
        onModeChange(nextMode);
        if (nextMode === 'ask') {
            setIsOpen(false);
        }
    };

    return (
        <Popover
            opened={isOpen}
            onChange={setIsOpen}
            shadow="md"
            width={480}
            position={position}
            offset={8}
            withinPortal
            hideDetached={false}
        >
            <Popover.Target>
                <Button
                    px="xs"
                    size="xs"
                    radius="xl"
                    variant={isDeepResearch ? 'light' : 'subtle'}
                    color={isDeepResearch ? 'blue' : 'gray'}
                    leftSection={
                        <MantineIcon
                            icon={IconTelescope}
                            size={14}
                            stroke={1.8}
                        />
                    }
                    rightSection={
                        <MantineIcon
                            icon={IconChevronDown}
                            size={14}
                            color={isDeepResearch ? 'blue.6' : 'ldGray.6'}
                        />
                    }
                    onClick={handleTargetClick}
                    aria-label="Deep research"
                    aria-pressed={isDeepResearch}
                >
                    Deep research
                </Button>
            </Popover.Target>

            <Popover.Dropdown p={0}>
                <Box p="sm">
                    <Text size="xs" fw={600} c="dimmed" mb={6}>
                        Mode
                    </Text>
                    <SegmentedControl
                        fullWidth
                        size="xs"
                        value={mode}
                        onChange={handleModeChange}
                        data={[
                            { value: 'ask', label: 'Ask' },
                            {
                                value: 'deep_research',
                                label: 'Deep research',
                            },
                        ]}
                        aria-label="Research mode"
                    />
                </Box>
                <Divider />
                {settings}
            </Popover.Dropdown>
        </Popover>
    );
};
