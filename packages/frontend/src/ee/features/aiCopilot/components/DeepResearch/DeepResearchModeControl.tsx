import { ActionIcon, Box, Button, Popover, ScrollArea } from '@mantine-8/core';
import { IconChevronDown, IconTelescope, IconX } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './DeepResearchModeControl.module.css';

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

    const handleEnable = () => {
        onModeChange('deep_research');
        setIsOpen(true);
    };

    const handleConfigure = () => {
        setIsOpen((current) => !current);
    };

    const handleExit = () => {
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
            <Box className={styles.control}>
                {isDeepResearch ? (
                    <Button.Group className={styles.controlInner}>
                        <Popover.Target>
                            <Button
                                size="xs"
                                variant="light"
                                color="blue"
                                className={`${styles.activeSegment} ${styles.activeMain}`}
                                leftSection={
                                    <MantineIcon
                                        icon={IconTelescope}
                                        size={14}
                                        stroke={1.8}
                                    />
                                }
                                onClick={handleConfigure}
                                aria-label="Deep research"
                                aria-expanded={isOpen}
                                aria-haspopup="dialog"
                            >
                                Deep research
                            </Button>
                        </Popover.Target>
                        <ActionIcon
                            size={30}
                            variant="light"
                            color="blue"
                            className={`${styles.activeSegment} ${styles.exitSegment}`}
                            onClick={handleExit}
                            aria-label="Exit deep research"
                        >
                            <MantineIcon icon={IconX} size={12} />
                        </ActionIcon>
                    </Button.Group>
                ) : (
                    <Popover.Target>
                        <Button
                            pl="xs"
                            pr={6}
                            size="xs"
                            radius="xl"
                            variant="subtle"
                            color="gray"
                            className={styles.controlInner}
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
                                    color="ldGray.6"
                                />
                            }
                            onClick={handleEnable}
                            aria-label="Deep research"
                            aria-pressed={false}
                        >
                            Deep research
                        </Button>
                    </Popover.Target>
                )}
            </Box>

            <Popover.Dropdown p={0}>
                <ScrollArea.Autosize mah={420} type="auto">
                    {settings}
                </ScrollArea.Autosize>
            </Popover.Dropdown>
        </Popover>
    );
};
