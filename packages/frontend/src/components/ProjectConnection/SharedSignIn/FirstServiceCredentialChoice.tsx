import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import { Radio, Stack, Text } from '@mantine/core';
import { useEffect, useRef, type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useWarehouseCredentialSummary } from '../../../hooks/useWarehouseCredentialSummary';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import {
    canUseServiceCredentialForPeople,
    shouldOfferFirstServiceCredentialChoice,
} from './sharedSignInCopy';

export const FirstServiceCredentialChoice: FC<{ disabled: boolean }> = ({
    disabled,
}) => {
    const form = useFormContext();
    const { savedProject, isProjectExtraConnection } = useProjectFormContext();
    const flag = useServerFeatureFlag(FeatureFlags.PersonalSignInSetup);
    const summary = useWarehouseCredentialSummary(savedProject?.projectUuid);
    const warehouse = form.values.warehouse;
    const initialized = useRef(false);
    const eligible = shouldOfferFirstServiceCredentialChoice(
        warehouse,
        flag.data?.enabled === true && !isProjectExtraConnection,
        !!savedProject,
        summary.data?.hasServiceAccount,
    );

    useEffect(() => {
        if (eligible && !initialized.current) {
            initialized.current = true;
            form.setFieldValue('warehouse.requireUserCredentials', true);
            if (warehouse.type === WarehouseTypes.BIGQUERY) {
                form.setFieldValue('warehouse.allowUserCredentials', false);
            }
        }
    }, [eligible, form, warehouse.type]);

    if (!eligible) return null;

    const canUseFallback = canUseServiceCredentialForPeople(warehouse.type);
    return (
        <Stack gap="xs" mt="md">
            <Radio.Group
                label="How should this service account be used?"
                value={
                    warehouse.requireUserCredentials === false
                        ? 'fallback'
                        : 'personal'
                }
                onChange={(value) => {
                    form.setFieldValue(
                        'warehouse.requireUserCredentials',
                        value === 'personal',
                    );
                    if (warehouse.type === WarehouseTypes.BIGQUERY) {
                        form.setFieldValue(
                            'warehouse.allowUserCredentials',
                            value === 'fallback',
                        );
                    }
                }}
            >
                <Stack gap="xs" mt="xs">
                    <Radio
                        value="personal"
                        label="Only schedules, compile and embeds"
                        disabled={disabled}
                    />
                    {canUseFallback && (
                        <Radio
                            value="fallback"
                            label="Also for people without their own sign-in"
                            disabled={disabled}
                        />
                    )}
                </Stack>
            </Radio.Group>
            {!canUseFallback && (
                <Text size="sm" c="dimmed">
                    Everyone signs in with their own account.
                </Text>
            )}
        </Stack>
    );
};
