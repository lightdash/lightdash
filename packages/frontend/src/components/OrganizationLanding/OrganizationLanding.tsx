import { OrganizationJoinRequestStatus } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import { Navigate } from 'react-router';
import { useOrganizationLanding } from '../../hooks/organization/useOrganizationLanding';
import useApp from '../../providers/App/useApp';
import AuthLayout from '../common/AuthLayout';
import Callout from '../common/Callout';
import PageSpinner from '../PageSpinner';
import { LandingChoices } from './LandingChoices';
import { getLandingTitle } from './organizationLandingCopy';

const APPROVAL_POLL_MS = 15_000;

export const OrganizationLanding: FC = () => {
    const { user } = useApp();
    const hasOrganization = !!user.data?.organizationUuid;
    const landing = useOrganizationLanding(!hasOrganization);
    const hasPendingRequest =
        landing.data?.requestable.some(
            (match) =>
                match.joinRequest?.status ===
                OrganizationJoinRequestStatus.PENDING,
        ) ?? false;
    const refetchUser = user.refetch;

    useEffect(() => {
        if (!hasPendingRequest) return undefined;
        const interval = window.setInterval(
            () => void refetchUser(),
            APPROVAL_POLL_MS,
        );
        return () => window.clearInterval(interval);
    }, [hasPendingRequest, refetchUser]);

    if (hasOrganization) {
        return <Navigate to="/" replace />;
    }
    if (landing.isInitialLoading) {
        return <PageSpinner />;
    }
    const title = getLandingTitle(landing.data);

    return (
        <AuthLayout pageTitle={title} title={title} legacyTitle={title}>
            {landing.error || !landing.data ? (
                <Callout
                    variant="danger"
                    title="We couldn't check for existing organizations"
                >
                    {landing.error?.error.message ??
                        'Reload the page to try again.'}
                </Callout>
            ) : (
                <LandingChoices landing={landing.data} />
            )}
        </AuthLayout>
    );
};
