import { type OrganizationLanding } from '@lightdash/common';
import { Anchor, Divider, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { CreateOrganizationForm } from './CreateOrganizationForm';
import { JoinableOrganizationCard } from './JoinableOrganizationCard';
import {
    getCreateOrganizationWarning,
    getMatchCount,
    getRequestListIntro,
    getSuggestedOrganizationName,
    getVisibleLandingMatches,
    hasNoWayIn,
    isPendingRequest,
    shouldShowOrganizationSearch,
} from './organizationLandingCopy';
import { RequestToJoinCard } from './RequestToJoinCard';

export const LandingChoices: FC<{ landing: OrganizationLanding }> = ({
    landing,
}) => {
    const [query, setQuery] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const hasMatches = getMatchCount(landing) > 0;
    const visible = getVisibleLandingMatches(landing, query);
    const visibleCount = visible.joinable.length + visible.requestable.length;
    const pending = visible.requestable.filter(isPendingRequest);
    const requestable = visible.requestable.filter(
        (match) => !isPendingRequest(match),
    );

    return (
        <Stack gap="lg">
            {shouldShowOrganizationSearch(landing) && (
                <TextInput
                    aria-label="Search organizations"
                    placeholder={`Search ${getMatchCount(landing)} organizations`}
                    leftSection={<MantineIcon icon={IconSearch} />}
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                />
            )}
            {pending.length + visible.joinable.length > 0 && (
                <Stack gap="xs">
                    {pending.map((match) => (
                        <RequestToJoinCard
                            key={match.organizationUuid}
                            match={match}
                        />
                    ))}
                    {visible.joinable.map((organization) => (
                        <JoinableOrganizationCard
                            key={organization.organizationUuid}
                            organization={organization}
                        />
                    ))}
                </Stack>
            )}
            {requestable.length > 0 && (
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        {getRequestListIntro(landing)}
                    </Text>
                    {requestable.map((match) => (
                        <RequestToJoinCard
                            key={match.organizationUuid}
                            match={match}
                        />
                    ))}
                </Stack>
            )}
            {query.trim() !== '' && visibleCount === 0 && (
                <Text size="sm" c="dimmed">
                    No organization matches “{query.trim()}”.
                </Text>
            )}
            {visible.hiddenCount > 0 && (
                <Text size="sm" c="dimmed">
                    {visible.hiddenCount} more. Search to find yours.
                </Text>
            )}
            {landing.canCreateOrganization && (
                <>
                    {hasMatches && <Divider label="or" />}
                    {hasMatches && !isCreating ? (
                        <Anchor
                            component="button"
                            type="button"
                            size="sm"
                            ta="left"
                            onClick={() => setIsCreating(true)}
                        >
                            Create a new organization instead
                        </Anchor>
                    ) : (
                        <CreateOrganizationForm
                            warning={getCreateOrganizationWarning(landing)}
                            suggestedName={getSuggestedOrganizationName(
                                landing,
                            )}
                        />
                    )}
                </>
            )}
            {hasNoWayIn(landing) && (
                <Text c="dimmed">
                    You need an invite to join this Lightdash instance. Ask the
                    person who runs it.
                </Text>
            )}
        </Stack>
    );
};
