import { FeatureFlags } from '@lightdash/common';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import Callout from '../../../../../../components/common/Callout';
import EmptyStateLoader from '../../../../../../components/common/EmptyStateLoader';
import { useServerFeatureFlag } from '../../../../../../hooks/useServerOrClientFeatureFlag';
import { useAiProviderCredentials } from '../../../hooks/useAiProviderCredentials';
import {
    useProjectAiProviderCredential,
    useSetProjectAiProviderCredential,
} from '../../../hooks/useProjectAiProviderCredential';

const ORGANIZATION_DEFAULT = 'organization-default';

type Props = {
    projectUuid: string;
};

export const ProjectAiRegionPanel: FC<Props> = ({ projectUuid }) => {
    const credentialsQuery = useAiProviderCredentials();
    const selectionQuery = useProjectAiProviderCredential(projectUuid);
    const setCredential = useSetProjectAiProviderCredential(projectUuid);
    const customProvidersFlagQuery = useServerFeatureFlag(
        FeatureFlags.OrgAiCustomProviders,
    );

    const [selected, setSelected] = useState<string | null>(null);

    if (
        credentialsQuery.isInitialLoading ||
        selectionQuery.isInitialLoading ||
        customProvidersFlagQuery.isInitialLoading
    ) {
        return <EmptyStateLoader />;
    }

    const credentials = credentialsQuery.data?.credentials ?? [];
    const storedUuid = selectionQuery.data?.credentialUuid ?? null;
    const value = selected ?? storedUuid ?? ORGANIZATION_DEFAULT;
    const defaultCredential = credentials.find((c) => c.isDefault) ?? null;
    const customProvidersEnabled =
        customProvidersFlagQuery.isSuccess &&
        customProvidersFlagQuery.data.enabled;

    // Mirrors the agent-settings selector: hidden while the flag is off — the
    // backend rejects the write anyway — unless a pin is already stored, which
    // must always offer a way to be cleared.
    if (!customProvidersEnabled && storedUuid === null) {
        return (
            <Callout variant="info">
                <Text fz="sm">
                    Custom AI providers are not enabled for this organization.
                </Text>
            </Callout>
        );
    }

    if (credentials.length === 0) {
        return (
            <Callout variant="info">
                <Text fz="sm">
                    No AI provider credentials are configured for this
                    organization yet. An organization admin can add them in
                    Organization settings → Ask AI.
                </Text>
            </Callout>
        );
    }

    const hasChanges =
        (value === ORGANIZATION_DEFAULT ? null : value) !== storedUuid;

    return (
        <Stack gap="sm">
            {!customProvidersEnabled && (
                <Callout variant="warning">
                    <Text fz="sm">
                        Custom AI providers are not enabled for this
                        organization, so this project's pinned credential is not
                        being served — AI features are unavailable in this
                        project. Clear the pin, or enable custom providers.
                    </Text>
                </Callout>
            )}
            <Select
                label="AI provider credential"
                description="Where this project's Ask AI requests are processed."
                data={[
                    {
                        value: ORGANIZATION_DEFAULT,
                        label: defaultCredential
                            ? `Organization default — ${defaultCredential.label} (${defaultCredential.region})`
                            : 'Organization default',
                    },
                    // While the flag is off only clearing is offered — the
                    // backend rejects any new pin.
                    ...credentials.map((credential) => ({
                        value: credential.uuid,
                        label: `${credential.label} — ${credential.region}`,
                        disabled: !customProvidersEnabled,
                    })),
                ]}
                value={value}
                onChange={setSelected}
            />

            {/* The honest limit of project-level pinning: a request that has
                to pick a project before it can run cannot already know it. */}
            <Callout variant="info">
                <Text fz="sm">
                    This covers Ask AI, agent conversations and generated
                    content in this project. It cannot cover Slack agent
                    routing, which asks a model which project a message belongs
                    to before any project is known — that call uses the
                    organization default.
                </Text>
            </Callout>

            <Group>
                <Button
                    disabled={!hasChanges}
                    loading={setCredential.isLoading}
                    onClick={() =>
                        setCredential.mutate(
                            value === ORGANIZATION_DEFAULT ? null : value,
                        )
                    }
                >
                    Save
                </Button>
            </Group>
        </Stack>
    );
};
