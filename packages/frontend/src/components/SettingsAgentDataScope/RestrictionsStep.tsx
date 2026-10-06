import { type SnowflakeAiBoundaryGuideConfig } from '@lightdash/common';
import { Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
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
    available: boolean;
};

const RestrictionsContent = ({
    guide,
    available,
    config,
}: RestrictionsProps & { config: SnowflakeAiBoundaryGuideConfig }) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const { restrictions, updateRestrictions } = guide;
    const refused = getRefusedMemberCount(config);
    const consequence = `${refused} of ${config.memberCount} people will be refused by AI until they sign in to Snowflake for AI.`;
    const description =
        "When on, AI uses each person's Snowflake sign-in for AI. This includes AI agents, the Slack agent, MCP and data apps. Without that sign-in, AI is refused.";
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
            <Text size="xs" c="dimmed">
                {consequence}
            </Text>
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
                        Raw SQL from AI stays off. The live test showed that the
                        session scope does not block RESULT_SCAN of the same
                        person’s earlier results.
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
