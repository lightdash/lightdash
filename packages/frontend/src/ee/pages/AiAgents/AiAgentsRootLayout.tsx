import * as Sentry from '@sentry/react';
import { Outlet, useMatch } from 'react-router';
import NavBar from '../../../components/NavBar';
import ScopeTourHost from '../../../features/scopeTours/ScopeTourHost';

const AiAgentsRootLayout = () => {
    // The settings form scrolls the window under a fixed AppShell sidebar, so
    // it needs the navbar fixed too; thread pages keep it static so the
    // in-thread chart editor modal can cover it, matching dashboard views.
    const isCreateForm = useMatch('/projects/:projectUuid/ai-agents/new');
    const isEditForm = useMatch(
        '/projects/:projectUuid/ai-agents/:agentUuid/edit/*',
    );
    const isSettingsForm = isCreateForm !== null || isEditForm !== null;

    return (
        <>
            <NavBar isFixed={isSettingsForm} />
            {/* A walkthrough that clicked into Ask AI continues here. */}
            <Sentry.ErrorBoundary fallback={<></>}>
                <ScopeTourHost />
            </Sentry.ErrorBoundary>
            <Outlet />
        </>
    );
};

export default AiAgentsRootLayout;
