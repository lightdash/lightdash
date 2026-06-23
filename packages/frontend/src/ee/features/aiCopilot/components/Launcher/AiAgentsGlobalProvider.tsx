import * as Sentry from '@sentry/react';
import {
    lazy,
    Suspense,
    useEffect,
    type FC,
    type PropsWithChildren,
} from 'react';
import { Provider } from 'react-redux';
import { useLocation, useMatches } from 'react-router';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { store } from '../../store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { PendingPromptProvider } from '../PendingPromptContext/PendingPromptContext';
import { LauncherDockProvider } from './LauncherDockProvider';
import { launcherSession } from './launcherSession';
import { useIsLauncherMounted } from './useIsLauncherMounted';

const AiAgentsLauncher = lazy(() =>
    import('./AiAgentsLauncher').then((module) => ({
        default: module.AiAgentsLauncher,
    })),
);

const AiAgentsLauncherGate: FC = () => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const isLauncherMounted = useIsLauncherMounted(activeProjectUuid);

    if (!isLauncherMounted) return null;

    return (
        <Suspense fallback={null}>
            <AiAgentsLauncher />
        </Suspense>
    );
};

// Keep this tiny tracker eager so full-page AI routes can always restore to
// the last non-agent URL without loading the launcher bundle.
const AiAgentsLauncherSessionTracker: FC = () => {
    const { pathname, search } = useLocation();
    const matches = useMatches();
    const isHidden = matches.some(
        (m) =>
            (m.handle as { hideAILauncher?: boolean } | undefined)
                ?.hideAILauncher,
    );

    useEffect(() => {
        if (isHidden) return;
        launcherSession.rememberLastNonAgentUrl(`${pathname}${search}`);
        launcherSession.clearExpandedFromBubble();
    }, [isHidden, pathname, search]);

    return null;
};

export const AiAgentsGlobalProvider: FC<PropsWithChildren> = ({ children }) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <PendingPromptProvider>
                <LauncherDockProvider>
                    {children}
                    <Sentry.ErrorBoundary fallback={<></>}>
                        <AiAgentsLauncherSessionTracker />
                        <AiAgentsLauncherGate />
                    </Sentry.ErrorBoundary>
                </LauncherDockProvider>
            </PendingPromptProvider>
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);
