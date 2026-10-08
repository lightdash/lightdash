import * as Sentry from '@sentry/react';
import {
    lazy,
    Suspense,
    useEffect,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useLocation, useMatches } from 'react-router';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { CreateIssueModalHost } from '../CreateIssue/CreateIssueModalHost';
import { AiAgentBuildWatcher } from './AiAgentBuildWatcher';
import { AiAgentsCoreProvider } from './AiAgentsCoreProvider';
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
    <AiAgentsCoreProvider>
        {children}
        <Sentry.ErrorBoundary fallback={<></>}>
            <AiAgentsLauncherSessionTracker />
            <AiAgentBuildWatcher />
            <AiAgentsLauncherGate />
            <CreateIssueModalHost />
        </Sentry.ErrorBoundary>
    </AiAgentsCoreProvider>
);
