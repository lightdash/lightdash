import { Box } from '@mantine/core';
import { useEffect, useRef, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTargetById } from '../../../../../hooks/usePortalTargetById';
import { store as aiAgentStore } from '../../store';
import { closePanel } from '../../store/aiAgentLauncherSlice';
import styles from './AiAgentsLauncher.module.css';

const AI_AGENTS_LAUNCHER_MODAL_HOST_ID = 'ai-agents-launcher-modal-host';

/**
 * Keeps the launcher inside a modal's DOM and visual bounds. Unmounting the
 * host collapses its conversation so it cannot move behind the closed modal.
 */
export const AiAgentsLauncherModalHost: FC = () => {
    const hostRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = hostRef.current;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.isComposing) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            aiAgentStore.dispatch(closePanel());
        };
        host?.addEventListener('keydown', handleKeyDown);

        return () => {
            host?.removeEventListener('keydown', handleKeyDown);
            aiAgentStore.dispatch(closePanel());
        };
    }, []);

    return (
        <Box
            id={AI_AGENTS_LAUNCHER_MODAL_HOST_ID}
            className={styles.modalHost}
            ref={hostRef}
        />
    );
};

type PortalProps = {
    children: ReactNode | ((isModalHosted: boolean) => ReactNode);
};

/** Uses the normal page position unless a modal explicitly hosts the launcher. */
export const AiAgentsLauncherPortal: FC<PortalProps> = ({ children }) => {
    const modalHost = usePortalTargetById(AI_AGENTS_LAUNCHER_MODAL_HOST_ID);
    const content =
        typeof children === 'function' ? children(!!modalHost) : children;

    return modalHost ? createPortal(content, modalHost) : content;
};
