import React, { useEffect, useState, type FC } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useEmailStatus } from '../hooks/useEmailVerification';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';
import PageSpinner from './PageSpinner';

const PrivateRoute: FC<React.PropsWithChildren> = ({ children }) => {
    const {
        health,
        user: { data, isInitialLoading },
    } = useApp();
    const location = useLocation();
    const ability = useAbilityContext();
    const emailStatus = useEmailStatus(!!health.data?.isAuthenticated);
    const isEmailServerConfigured = health.data?.hasEmailClient;
    // Initialize based on whether ability already has rules (e.g., from previous navigation)
    // This prevents a loading flash when navigating between pages
    const [abilityInitialized, setAbilityInitialized] = useState(
        () => ability.rules.length > 0,
    );

    useEffect(() => {
        if (data) {
            ability.update(data.abilityRules);
            setAbilityInitialized(true);
        }
    }, [ability, data]);

    if (health.isInitialLoading || health.error) {
        return <PageSpinner />;
    }

    if (!health.data?.isAuthenticated) {
        // Also pass the original URL as a query param. State.from is the
        // primary mechanism, but it can be lost across hard redirects
        // (window.location.href = '/login'), server-issued res.redirect, and
        // some browser refresh paths — the query param survives all of those.
        const originalUrl = `${location.pathname}${location.search}${location.hash}`;
        const search =
            originalUrl && originalUrl !== '/'
                ? `?redirect=${encodeURIComponent(originalUrl)}`
                : '';
        return (
            <Navigate
                to={{
                    pathname: '/login',
                    search,
                }}
                state={{ from: location }}
            />
        );
    }

    if (
        isInitialLoading ||
        emailStatus.isInitialLoading ||
        (data && !abilityInitialized)
    ) {
        return <PageSpinner />;
    }

    if (isEmailServerConfigured && !emailStatus.data?.isVerified) {
        return (
            <Navigate
                to={{
                    pathname: '/verify-email',
                }}
                state={{ from: location }}
            />
        );
    }

    if (!data?.organizationUuid) {
        return (
            <Navigate
                to={{
                    pathname: '/join-organization',
                }}
                state={{ from: location }}
            />
        );
    }

    return <>{children}</>;
};

export default PrivateRoute;
