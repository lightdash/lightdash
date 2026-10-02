import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import { Button, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import Callout from '../../common/Callout';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import {
    getServiceMethods,
    isPersonSignInMethod,
    SHARED_SIGN_IN_REFUSAL_MESSAGE,
} from './sharedSignInCopy';

export const SharedSignInRefusal: FC<{ disabled: boolean }> = ({
    disabled,
}) => {
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const flag = useServerFeatureFlag(FeatureFlags.PersonalSignInSetup);
    if (
        flag.data?.enabled !== true ||
        !savedProject ||
        !isPersonSignInMethod(form.values.warehouse)
    ) {
        return null;
    }

    const serviceMethod = getServiceMethods(form.values.warehouse.type)[0];
    return (
        <Callout variant="warning" title="Use your own sign-in">
            <Group justify="space-between" wrap="nowrap">
                <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                    {SHARED_SIGN_IN_REFUSAL_MESSAGE}
                </Text>
                {serviceMethod && (
                    <Button
                        size="xs"
                        variant="default"
                        style={{ flexShrink: 0 }}
                        disabled={disabled}
                        onClick={() => {
                            form.setFieldValue(
                                'warehouse.authenticationType',
                                serviceMethod.authenticationType as never,
                            );
                            if (
                                form.values.warehouse.type ===
                                WarehouseTypes.BIGQUERY
                            ) {
                                form.setFieldValue(
                                    'warehouse.keyfileContents',
                                    {} as never,
                                );
                            } else if (
                                form.values.warehouse.type ===
                                WarehouseTypes.REDSHIFT
                            ) {
                                form.setFieldValue(
                                    'warehouse.accessKeyId',
                                    undefined as never,
                                );
                                form.setFieldValue(
                                    'warehouse.secretAccessKey',
                                    undefined as never,
                                );
                                form.setFieldValue(
                                    'warehouse.sessionToken',
                                    undefined as never,
                                );
                            } else {
                                form.setFieldValue(
                                    'warehouse.refreshToken',
                                    undefined as never,
                                );
                                form.setFieldValue(
                                    'warehouse.token',
                                    undefined as never,
                                );
                            }
                        }}
                    >
                        Add a service account
                    </Button>
                )}
            </Group>
        </Callout>
    );
};
