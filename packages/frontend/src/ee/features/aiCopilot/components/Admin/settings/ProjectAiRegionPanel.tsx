import { FeatureFlags } from '@lightdash/common';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiCopilotAdmin');
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
                <Text fz="sm">{t('settings.projectRegion.notEnabled')}</Text>
            </Callout>
        );
    }

    if (credentials.length === 0) {
        return (
            <Callout variant="info">
                <Text fz="sm">{t('settings.projectRegion.noCredentials')}</Text>
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
                        {t('settings.projectRegion.pinNotServed')}
                    </Text>
                </Callout>
            )}
            <Select
                label={t('settings.projectRegion.label')}
                description={t('settings.projectRegion.description')}
                data={[
                    {
                        value: ORGANIZATION_DEFAULT,
                        label: defaultCredential
                            ? t('settings.projectRegion.orgDefaultWith', {
                                  label: defaultCredential.label,
                                  region: defaultCredential.region,
                              })
                            : t('settings.projectRegion.orgDefault'),
                    },
                    // While the flag is off only clearing is offered — the
                    // backend rejects any new pin.
                    ...credentials.map((credential) => ({
                        value: credential.uuid,
                        label: t('settings.projectRegion.credentialOption', {
                            label: credential.label,
                            region: credential.region,
                        }),
                        disabled: !customProvidersEnabled,
                    })),
                ]}
                value={value}
                onChange={setSelected}
            />

            {/* The honest limit of project-level pinning: a request that has
                to pick a project before it can run cannot already know it. */}
            <Callout variant="info">
                <Text fz="sm">{t('settings.projectRegion.coverage')}</Text>
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
                    {t('actions.save', { ns: 'common' })}
                </Button>
            </Group>
        </Stack>
    );
};
