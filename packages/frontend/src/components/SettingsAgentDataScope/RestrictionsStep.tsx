import { type SnowflakeAiBoundaryGuideConfig } from '@lightdash/common';
import { Anchor, Button, Group, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import InlineErrorState from '../common/InlineErrorState';
import MantineModal from '../common/MantineModal';
import { SettingsCard } from '../common/Settings/SettingsCard';
import {
    getRefusedMemberCount,
    needsRestrictionsConfirmation,
} from './snowflakeAiBoundaryStatus';
import { type BoundaryGuide } from './useBoundaryGuide';

type RestrictionsProps = {
    guide: BoundaryGuide;
    projectUuid: string;
    available: boolean;
};

const RestrictionsContent = ({
    guide,
    projectUuid,
    available,
    config,
}: RestrictionsProps & { config: SnowflakeAiBoundaryGuideConfig }) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const { restrictions, updateRestrictions } = guide;
    const refused = getRefusedMemberCount(config);
    const readyRequirement = config.aiIdentitiesEnabled
        ? 'their AI identity is ready'
        : 'they sign in to Snowflake for AI';
    const consequence = `${refused} of ${config.memberCount} people will be refused by AI until ${readyRequirement}.`;
    const description = config.aiIdentitiesEnabled
        ? "When on, AI agents and MCP use only each person's ready AI identity. Without a ready AI identity, AI is refused."
        : "When on, AI agents and MCP use only each person's sign-in for AI, and raw SQL from AI is off. Without that sign-in, AI is refused.";
    const update = (enabled: boolean) =>
        updateRestrictions.mutate(enabled, {
            onSuccess: () => {
                setConfirmOpen(false);
                void guide.config.refetch();
            },
        });
    return (
        <Stack gap="sm">
            <Switch
                label="AI access restrictions"
                description={description}
                checked={restrictions?.enabled ?? false}
                disabled={
                    !available || !restrictions || updateRestrictions.isLoading
                }
                onChange={(event) => {
                    const enabled = event.currentTarget.checked;
                    if (enabled && needsRestrictionsConfirmation(config))
                        setConfirmOpen(true);
                    else update(enabled);
                }}
            />
            {restrictions?.enabled && (
                <Group justify="flex-end">
                    <Button
                        component={Link}
                        to={`/generalSettings/aiIdentities?project=${projectUuid}&account=${config.aiIdentityAccountUuid ?? ''}&tab=setup&review=1`}
                    >
                        Review the plan
                    </Button>
                </Group>
            )}
            {!restrictions?.enabled && (
                <Text size="xs" c="dimmed">
                    {consequence}{' '}
                    {config.aiIdentitiesEnabled && (
                        <Anchor
                            component={Link}
                            to={`/generalSettings/aiIdentities?project=${projectUuid}&account=${config.aiIdentityAccountUuid ?? ''}&tab=setup&review=1`}
                            size="xs"
                        >
                            Review AI identities
                        </Anchor>
                    )}
                </Text>
            )}
            {updateRestrictions.isError && (
                <InlineErrorState message="Could not update AI access restrictions." />
            )}
            <MantineModal
                opened={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                title="Turn on AI access restrictions?"
                confirmLabel="Turn on restrictions"
                onConfirm={() => update(true)}
                confirmLoading={updateRestrictions.isLoading}
            >
                <Stack gap="sm">
                    <Text size="sm">{consequence}</Text>
                    {config.statuses.checks !== 'verified' && (
                        <Text size="sm">
                            Boundary checks have not all passed. Run checks to
                            verify masking and session restrictions.
                        </Text>
                    )}
                    <Text size="sm">
                        {config.aiIdentitiesEnabled
                            ? 'People with a ready AI identity can continue to query with AI.'
                            : 'Raw SQL from AI agents and MCP will be turned off.'}
                    </Text>
                </Stack>
            </MantineModal>
        </Stack>
    );
};

export const RestrictionsStep = (props: RestrictionsProps) => (
    <SettingsCard p="xl">
        {props.guide.config.data ? (
            <RestrictionsContent {...props} config={props.guide.config.data} />
        ) : (
            <Switch
                label="AI access restrictions"
                description="Load the guide to review who will be refused by AI."
                checked={props.guide.restrictions?.enabled ?? false}
                disabled
            />
        )}
    </SettingsCard>
);
