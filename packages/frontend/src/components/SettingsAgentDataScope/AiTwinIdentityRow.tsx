import type { AiIdentity } from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useState } from 'react';
import {
    useTestAiIdentity,
    useUpdateAiIdentity,
} from '../../hooks/useAiIdentities';
import { aiIdentityStatusColor } from './aiTwinStatus';
export const AiTwinIdentityRow = ({
    projectUuid,
    identity,
    testingAll,
}: {
    projectUuid: string;
    identity: AiIdentity;
    testingAll: boolean;
}) => {
    const [override, setOverride] = useState<string | null>(null);
    const update = useUpdateAiIdentity(projectUuid);
    const test = useTestAiIdentity(projectUuid);
    const value = override ?? identity.twinNameOverride ?? '';
    const error = update.error ?? test.error;
    return (
        <Table.Tr>
            <Table.Td>
                {identity.firstName} {identity.lastName}
            </Table.Td>
            <Table.Td>{identity.email}</Table.Td>
            <Table.Td>{identity.snowflakeLogin ?? 'Not linked'}</Table.Td>
            <Table.Td>
                <Text fz="sm">{identity.twinName ?? 'Not named'}</Text>
                <Group wrap="nowrap">
                    <TextInput
                        aria-label={`AI user name override for ${identity.email}`}
                        placeholder="Use naming template"
                        value={value}
                        onChange={(event) =>
                            setOverride(event.currentTarget.value)
                        }
                    />
                    <Button
                        size="xs"
                        loading={update.isLoading}
                        disabled={testingAll || test.isLoading}
                        onClick={() =>
                            update.mutate({
                                userUuid: identity.userUuid,
                                body: {
                                    twinNameOverride: value.trim() || null,
                                },
                            })
                        }
                    >
                        Save
                    </Button>
                </Group>
                {error && (
                    <Text c="red" fz="xs">
                        {error.error.message}
                    </Text>
                )}
            </Table.Td>
            <Table.Td>
                <Tooltip label={identity.publicKeyFingerprint}>
                    <Text fz="xs">
                        {identity.publicKeyFingerprint.slice(0, 19)}…
                    </Text>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                <Tooltip label={identity.statusMessage ?? identity.status}>
                    <Badge color={aiIdentityStatusColor(identity.status)}>
                        {identity.status}
                    </Badge>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                <Button
                    size="xs"
                    loading={test.isLoading}
                    disabled={testingAll || update.isLoading}
                    onClick={() => test.mutate(identity.userUuid)}
                >
                    Test
                </Button>
            </Table.Td>
        </Table.Tr>
    );
};
