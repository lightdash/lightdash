import {
    Box,
    Button,
    Divider,
    Group,
    Popover,
    ScrollArea,
} from '@mantine-8/core';
import { IconChevronDown, IconTelescope } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type AgentComposerMode = 'ask' | 'deep_research';

type Props = {
    mode: AgentComposerMode;
    onModeChange: (mode: AgentComposerMode) => void;
    settings: ReactNode;
};

export const DeepResearchModeControl = ({
    mode,
    onModeChange,
    settings,
}: Props) => {
    const isDeepResearch = mode === 'deep_research';
    const [isOpen, setIsOpen] = useState(false);

    const handleTargetClick = () => {
        if (!isDeepResearch) {
            onModeChange('deep_research');
        }
        setIsOpen((current) => !current);
    };

    const handleDisable = () => {
        onModeChange('ask');
        setIsOpen(false);
    };

    return (
        <Popover
            opened={isOpen}
            onChange={setIsOpen}
            shadow="md"
            width={280}
            position="top-end"
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
                <ScrollArea.Autosize mah={420} type="auto">
                    {settings}
                </ScrollArea.Autosize>
                <Divider mx="sm" />
                <Box p="sm">
                    <Group justify="flex-end">
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={handleDisable}
                        >
                            Disable
                        </Button>
                    </Group>
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};
