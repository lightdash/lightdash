import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import { LAST_PROJECT_KEY, LAST_USER_KEY } from '../../hooks/useActiveProject';
import useUser from '../../hooks/user/useUser';
import AppProviderContext from './context';

const AppProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const health = useHealth();
    const user = useUser(!!health?.data?.isAuthenticated);
    const queryClient = useQueryClient();

    // Central identity-change detector: never let one user's client state leak
    // into another user's session. Two kinds of staleness are handled
    // separately. The in-memory query cache only ever holds the previous
    // user's data on a same-page identity change (tracked with a ref), where
    // it is cleared. localStorage also survives full reloads — which most auth
    // flows (login, register, SSO) trigger via window.location — so
    // auth-scoped keys like lastProject are cleared whenever the resolved user
    // differs from the persisted previous one; leaving them would make the
    // new session request the old user's project (403s). Hooking here rather
    // than each auth mutation covers every path.
    const sessionIdentityRef = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        // undefined => identity not yet resolved (health or user still loading)
        let currentIdentity: string | null | undefined;
        if (health.data) {
            currentIdentity = health.data.isAuthenticated
                ? user.data?.userUuid
                : null;
        }
        if (currentIdentity === undefined) return;

        const previousSessionIdentity = sessionIdentityRef.current;
        sessionIdentityRef.current = currentIdentity;

        if (
            previousSessionIdentity != null &&
            previousSessionIdentity !== currentIdentity
        ) {
            // Same-page transition away from a signed-in user (account switch,
            // logout, session expiry): drop their cached data. lastProject is
            // intentionally kept on transition to logged-out so that the same
            // user logging back in returns to their project; a different user
            // is handled below.
            queryClient.clear();
        }

        if (currentIdentity !== null) {
            const storedIdentity = localStorage.getItem(LAST_USER_KEY);
            if (storedIdentity !== null && storedIdentity !== currentIdentity) {
                localStorage.removeItem(LAST_PROJECT_KEY);
                void queryClient.invalidateQueries(['activeProject']);
            }
            localStorage.setItem(LAST_USER_KEY, currentIdentity);
        }
    }, [health.data, user.data?.userUuid, queryClient]);

    const value = {
        health,
        user,
    };

    return (
        <AppProviderContext.Provider value={value}>
            {children}
        </AppProviderContext.Provider>
    );
};

export default AppProvider;
