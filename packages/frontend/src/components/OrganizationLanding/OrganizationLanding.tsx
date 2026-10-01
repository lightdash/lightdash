import { Divider, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useOrganizationLanding } from '../../hooks/organization/useOrganizationLanding';
import AuthLayout from '../common/AuthLayout';
import Callout from '../common/Callout';
import PageSpinner from '../PageSpinner';
import { CreateOrganizationForm } from './CreateOrganizationForm';
import { JoinableOrganizationCard } from './JoinableOrganizationCard';
import {
    getCreateOrganizationWarning,
    getRequestCardContext,
    getSuggestedOrganizationName,
    hasNoWayIn,
} from './organizationLandingCopy';
import { RequestToJoinCard } from './RequestToJoinCard';

export const OrganizationLanding: FC = () => {
    const landing = useOrganizationLanding(true);

    if (landing.isInitialLoading) {
        return <PageSpinner />;
    }

    return (
        <AuthLayout
            pageTitle="Choose your organization"
            title="Choose your organization"
            legacyTitle="Choose your organization"
        >
            {landing.error || !landing.data ? (
                <Callout
                    variant="danger"
                    title="We couldn't check for existing organizations"
                >
                    {landing.error?.error.message ??
                        'Reload the page to try again.'}
                </Callout>
            ) : (
                <Stack gap="lg">
                    {landing.data.joinable.map((organization) => (
                        <JoinableOrganizationCard
                            key={organization.organizationUuid}
                            organization={organization}
                        />
                    ))}
                    {landing.data.requestable.map((match) => (
                        <RequestToJoinCard
                            key={match.organizationUuid}
                            match={match}
                            context={getRequestCardContext(landing.data)}
                        />
                    ))}
                    {landing.data.canCreateOrganization && (
                        <>
                            {(landing.data.joinable.length > 0 ||
                                landing.data.requestable.length > 0) && (
                                <Divider label="or" />
                            )}
                            <CreateOrganizationForm
                                warning={getCreateOrganizationWarning(
                                    landing.data,
                                )}
                                suggestedName={getSuggestedOrganizationName(
                                    landing.data,
                                )}
                            />
                        </>
                    )}
                    {hasNoWayIn(landing.data) && (
                        <Text c="dimmed">
                            You need an invite to join this Lightdash instance.
                            Ask the person who runs it.
                        </Text>
                    )}
                </Stack>
            )}
        </AuthLayout>
    );
};
