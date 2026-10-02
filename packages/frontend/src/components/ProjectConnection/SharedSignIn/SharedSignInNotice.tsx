import { type WarehouseTypes } from '@lightdash/common';
import { Box, Button, Group, Menu, Stack, Text } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useWarehouseCredentialSummary } from '../../../hooks/useWarehouseCredentialSummary';
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';
import {
    getRunsAsLabel,
    getServiceMethods,
    getStopsWorkingLabel,
    type ServiceMethod,
} from './sharedSignInCopy';

const ADD_SERVICE_ACCOUNT = 'Add a service account';

export const SharedSignInNotice: FC<{
    projectUuid: string;
    warehouseType: WarehouseTypes;
    disabled: boolean;
}> = ({ projectUuid, warehouseType, disabled }) => {
    const form = useFormContext();
    const summary = useWarehouseCredentialSummary(projectUuid);
    const [chosen, setChosen] = useState<ServiceMethod | null>(null);
    const sharedSignIn = summary.data?.sharedSignIn;
    if (!sharedSignIn) return null;

    const methods = getServiceMethods(warehouseType);
    const choose = (method: ServiceMethod) => {
        form.setFieldValue(
            'warehouse.authenticationType',
            method.authenticationType,
        );
        setChosen(method);
    };

    return (
        <Box mb="md">
            <Callout variant="warning" title={getRunsAsLabel(sharedSignIn)}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap={2} miw={0}>
                        <Text size="sm">{getStopsWorkingLabel(null)}</Text>
                        <Text size="xs" c="dimmed">
                            Everyone in this project queries as this person
                            until then.
                        </Text>
                    </Stack>
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
            </Callout>
        </Box>
    );
};
