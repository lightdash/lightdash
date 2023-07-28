import {
    Box,
    Button,
    CloseButton,
    Divider,
    Flex,
    Popover,
} from '@mantine/core';
import { IconChevronDown, IconX } from '@tabler/icons-react';
import React, { useState } from 'react';
import Draggable from 'react-draggable';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';

const ConfigMenuContainer: React.FC = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Popover
            opened={isOpen}
            zIndex={1000}
            withinPortal={true}
            withArrow={false}
            offset={4}
            shadow="lg"
        >
            <Popover.Target>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    onClick={() => setIsOpen((old) => !old)}
                    rightIcon={
                        <MantineIcon
                            icon={isOpen ? IconX : IconChevronDown}
                            color="gray"
                        />
                    }
                >
                    {isOpen ? 'Close configure' : 'Configure'}
                </Button>
            </Popover.Target>

            {isOpen && (
                <Draggable handle=".handle" defaultPosition={{ y: 0, x: -12 }}>
                    <Popover.Dropdown p={0}>
                        <Flex
                            sx={{
                                backgroundColor: '#F1F1F1',
                                width: '100%',
                            }}
                        >
                            <Box
                                className="handle"
                                sx={{
                                    cursor: 'move',
                                    width: '100%',
                                }}
                            >
                                <Divider my={1} size="sm" variant="dotted" />
                                <Divider my={3} size="sm" variant="dotted" />
                                <Divider mt={3} size="sm" variant="dotted" />
                            </Box>
                            <CloseButton
                                size={16}
                                variant="transparent"
                                onClick={() => setIsOpen((old) => !old)}
                            />
                        </Flex>
                        <Box
                            p="md"
                            pt="xs"
                            sx={{
                                maxHeight: '400px',
                                overflow: 'auto',
                            }}
                        >
                            {children}
                        </Box>
                    </Popover.Dropdown>
                </Draggable>
            )}
        </Popover>
    );
};

export default ConfigMenuContainer;
