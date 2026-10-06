import {
    AiIdentityCreationMode,
    AiIdentityProvisionerStatus,
    type AiIdentityAccount,
} from '@lightdash/common';
import { Paper, Radio, Stack, Title } from '@mantine/core';
import { useState, type ComponentProps, type FC } from 'react';
import Callout from '../../components/common/Callout';
import { AiIdentityAutomaticSetup } from './AiIdentityAutomaticSetup';
import { AiIdentitySetup } from './AiIdentitySetup';
import { aiIdentityProvisioningApi } from './api';
import { useProvisioning, useProvisioningChange } from './useProvisioning';

export const AiIdentityCreationSetup: FC<{
    account: AiIdentityAccount;
    onJob: ComponentProps<typeof AiIdentitySetup>['onJob'];
    onProvisioningJob: (uuid: string) => void;
}> = ({ account, onJob, onProvisioningJob }) => {
    const uuid = account.aiIdentityAccountUuid;
    const query = useProvisioning(uuid);
    const change = useProvisioningChange(uuid);
    const [selectedMode, setSelectedMode] =
        useState<AiIdentityCreationMode | null>(null);
    const savedMode = query.data?.provisioner?.setupCheck?.waitingSince
        ? AiIdentityCreationMode.AUTOMATIC
        : (query.data?.mode ?? AiIdentityCreationMode.GUIDED);
    const mode = selectedMode ?? savedMode;
    return (
        <Stack gap="lg">
            <Paper p="md">
                <Stack gap="sm">
                    <Title order={5}>
                        How should AI identities be created?
                    </Title>
                    <Radio.Group
                        value={mode}
                        onChange={(value) => {
                            const next =
                                value === AiIdentityCreationMode.AUTOMATIC
                                    ? AiIdentityCreationMode.AUTOMATIC
                                    : AiIdentityCreationMode.GUIDED;
                            setSelectedMode(next);
                            if (
                                next === AiIdentityCreationMode.AUTOMATIC &&
                                query.data?.provisioner?.status !==
                                    AiIdentityProvisionerStatus.READY
                            )
                                return;
                            change.mutate(() =>
                                aiIdentityProvisioningApi.update(uuid, {
                                    mode: next,
                                }),
                            );
                        }}
                    >
                        <Stack gap="xs">
                            <Radio
                                disabled={
                                    query.isLoading ||
                                    query.isError ||
                                    change.isLoading
                                }
                                value="guided"
                                label="Your team creates them"
                            />
                            <Radio
                                disabled={
                                    query.isLoading ||
                                    query.isError ||
                                    change.isLoading
                                }
                                value="automatic"
                                label="Lightdash creates them"
                            />
                        </Stack>
                    </Radio.Group>
                    {change.error && query.data?.mode !== mode && (
                        <Callout variant="danger">
                            {change.error.error.message}
                        </Callout>
                    )}
                    {query.isError && (
                        <Callout variant="danger">
                            Could not load provisioning settings.
                        </Callout>
                    )}
                </Stack>
            </Paper>
            {mode === AiIdentityCreationMode.AUTOMATIC && query.data ? (
                <AiIdentityAutomaticSetup
                    settings={query.data}
                    onJob={onProvisioningJob}
                />
            ) : (
                <AiIdentitySetup account={account} onJob={onJob} />
            )}
        </Stack>
    );
};
