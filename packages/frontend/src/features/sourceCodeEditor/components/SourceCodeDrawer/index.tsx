import { ActionIcon, Drawer, Group, Kbd, Text } from '@mantine-8/core';
import { useHotkeys } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSourceCodeEditor } from '../../context/useSourceCodeEditor';
import SourceCodeEditorContent from '../SourceCodeEditorContent';
import styles from './SourceCodeDrawer.module.css';

const SourceCodeDrawer: FC = () => {
    const { isOpen, close, toggle, hasUnsavedChanges } = useSourceCodeEditor();

    // Global keyboard shortcuts
    useHotkeys([
        ['mod+shift+E', () => toggle()],
        ['mod+`', () => toggle()],
    ]);

    const handleClose = () => {
        // TODO: Add unsaved changes warning if needed
        if (hasUnsavedChanges) {
            // For now, just close - the content component handles unsaved changes
        }
        close();
    };

    return (
        <Drawer
            opened={isOpen}
            onClose={handleClose}
            position="right"
            size="90%"
            withOverlay
            overlayProps={{
                blur: 2,
                backgroundOpacity: 0.5,
            }}
            transitionProps={{
                transition: 'slide-left',
                duration: 250,
                timingFunction: 'ease-out',
            }}
            closeOnEscape
            trapFocus
            withCloseButton={false}
            classNames={{
                content: styles.drawerContent,
                body: styles.drawerBody,
            }}
        >
            <Group
                justify="space-between"
                p="sm"
                className={styles.drawerHeader}
            >
                <Group gap="sm">
                    <ActionIcon
                        onClick={handleClose}
                        variant="subtle"
                        color="gray"
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                    <Text fw={500}>Source Code Editor</Text>
                </Group>
                <Group gap="xs">
                    <Kbd size="xs">
                        {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                    </Kbd>
                    <Kbd size="xs">Shift</Kbd>
                    <Kbd size="xs">E</Kbd>
                    <Text size="xs" c="dimmed">
                        to toggle
                    </Text>
                </Group>
            </Group>

            {isOpen && <SourceCodeEditorContent />}
        </Drawer>
    );
};

export default SourceCodeDrawer;
