import { type WarehouseTypes } from '@lightdash/common';
import { Button, Group, Menu, Paper, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconUserCircle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useSharedCredentialOwner } from '../../../hooks/useSharedCredentialOwner';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';
import {
    getRunsAsLabel,
    getServiceMethods,
    type ServiceMethod,
} from './sharedSignInCopy';

const ADD_SERVICE_ACCOUNT = 'Add a service account';

export const SharedSignInNotice: FC<{
    projectUuid: string;
    warehouseType: WarehouseTypes;
    disabled: boolean;
}> = ({ projectUuid, warehouseType, disabled }) => {
    const form = useFormContext();
    const credentialOwner = useSharedCredentialOwner(projectUuid);
    const [chosen, setChosen] = useState<ServiceMethod | null>(null);
    if (!credentialOwner.data) return null;

    const methods = getServiceMethods(warehouseType);
    const choose = (method: ServiceMethod) => {
        form.setFieldValue(
            'warehouse.authenticationType',
            method.authenticationType as never,
        );
        setChosen(method);
    };

    return (
        <Paper p="sm" mb="md">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="sm" wrap="nowrap" align="flex-start" miw={0}>
                    <MantineIcon icon={IconUserCircle} size="lg" />
                    <Stack gap={2} miw={0}>
                        <Text size="sm" fw={600}>
                            {getRunsAsLabel(credentialOwner.data)}
                        </Text>
                        <Text size="xs" c="dimmed">
                            Everyone in this project queries as this person. If
                            the sign-in expires, the project stops working.
                        </Text>
                    </Stack>
                </Group>
                {methods.length === 1 && (
                    <Button
                        size="xs"
                        variant="default"
                        flex="none"
                        disabled={disabled}
                        onClick={() => choose(methods[0])}
                    >
                        {ADD_SERVICE_ACCOUNT}
                    </Button>
                )}
                {methods.length > 1 && (
                    <Menu position="bottom-end">
                        <Menu.Target>
                            <Button
                                size="xs"
                                variant="default"
                                flex="none"
                                disabled={disabled}
                                rightSection={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                            >
                                {ADD_SERVICE_ACCOUNT}
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {methods.map((method) => (
                                <Menu.Item
                                    key={method.authenticationType}
                                    onClick={() => choose(method)}
                                >
                                    {method.label}
                                </Menu.Item>
                            ))}
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Group>
            {chosen && (
                <Text size="xs" c="dimmed" mt="xs">
                    Fill in the {chosen.label.toLowerCase()} below and save.
                    Everyone in this project then queries as the service
                    account.
                </Text>
            )}
        </Paper>
    );
};
