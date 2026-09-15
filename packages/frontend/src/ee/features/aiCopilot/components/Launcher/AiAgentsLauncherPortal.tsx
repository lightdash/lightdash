import { Box } from '@mantine/core';
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { usePortalTargetById } from '../../../../../hooks/usePortalTargetById';
import { store as aiAgentStore } from '../../store';
import { closePanel } from '../../store/aiAgentLauncherSlice';
import styles from './AiAgentsLauncher.module.css';

const AI_AGENTS_LAUNCHER_MODAL_HOST_ID = 'ai-agents-launcher-modal-host';

/** Keeps the launcher inside a modal's DOM and visual bounds. */
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
    const previousModalHostRef = useRef<HTMLElement | null>(null);
    const pageHostRef = useRef<HTMLDivElement>(null);
    const [portalContainer] = useState<HTMLDivElement | null>(() => {
        if (typeof document === 'undefined') return null;
        const container = document.createElement('div');
        container.className = styles.portalContainer;
        return container;
    });
    const content =
        typeof children === 'function' ? children(!!modalHost) : children;

    useLayoutEffect(() => {
        if (previousModalHostRef.current && !modalHost) {
            aiAgentStore.dispatch(closePanel());
        }
        previousModalHostRef.current = modalHost;
    }, [modalHost]);

    useLayoutEffect(() => {
        const destination = modalHost ?? pageHostRef.current;
        if (portalContainer && destination) {
            destination.appendChild(portalContainer);
        }
    }, [modalHost, portalContainer]);

    useLayoutEffect(
        () => () => {
            portalContainer?.remove();
        },
        [portalContainer],
    );

    return (
        <>
            <Box ref={pageHostRef} display="contents" />
            {portalContainer && createPortal(content, portalContainer)}
        </>
    );
};
