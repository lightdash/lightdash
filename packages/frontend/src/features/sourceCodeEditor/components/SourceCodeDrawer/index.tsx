import { ProjectType } from '@lightdash/common';
import { Drawer } from '@mantine-8/core';
import { useHotkeys } from '@mantine/hooks';
import { type FC } from 'react';
import {
    BANNER_HEIGHT,
    NAVBAR_HEIGHT,
} from '../../../../components/common/Page/constants';
import { useActiveProjectUuid } from '../../../../hooks/useActiveProject';
import { useProject } from '../../../../hooks/useProject';
import { useSourceCodeEditor } from '../../context/useSourceCodeEditor';
import SourceCodeEditorContent from '../SourceCodeEditorContent';
import styles from './SourceCodeDrawer.module.css';

/**
 * Inner drawer content that fetches project data.
 * Only mounted when drawer is open to avoid API calls on unauthenticated routes.
 */
const SourceCodeDrawerContent: FC<{ onClose: () => void }> = ({ onClose }) => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);

    const isPreviewProject = project?.type === ProjectType.PREVIEW;
    const topOffset = NAVBAR_HEIGHT + (isPreviewProject ? BANNER_HEIGHT : 0);

    return (
        <Drawer
            opened
            onClose={onClose}
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
            trapFocus={false}
            withCloseButton={false}
            classNames={{
                content: styles.drawerContent,
                body: styles.drawerBody,
                inner: styles.drawerInner,
                overlay: styles.drawerOverlay,
            }}
            __vars={{
                '--drawer-top-offset': `${topOffset}px`,
            }}
        >
            <SourceCodeEditorContent />
        </Drawer>
    );
};

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

    // Only render the drawer content when open to avoid API calls on unauthenticated routes
    if (!isOpen) {
        return null;
    }

    return <SourceCodeDrawerContent onClose={handleClose} />;
};

export default SourceCodeDrawer;
