import type { AiIdentitiesSummary } from '@lightdash/common';
import { Badge, Button, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { useTestAiIdentity } from '../../hooks/useAiIdentities';
import { AiTwinIdentityRow } from './AiTwinIdentityRow';
export const AiTwinCheckStep = ({
    projectUuid,
    summary,
}: {
    projectUuid: string;
    summary: AiIdentitiesSummary;
}) => {
    const test = useTestAiIdentity(projectUuid);
    const [testingAll, setTestingAll] = useState(false);
    const [failedCount, setFailedCount] = useState(0);
    const testAll = async () => {
        setTestingAll(true);
        setFailedCount(0);
        try {
            await summary.identities.reduce(
                (previous, identity) =>
                    previous.then(() =>
                        test.mutateAsync(identity.userUuid).then(
                            () => undefined,
                            () => setFailedCount((count) => count + 1),
                        ),
                    ),
                Promise.resolve(),
            );
        } finally {
            setTestingAll(false);
        }
    };
    return (
        <Stack gap="sm">
            <Button
                size="xs"
                loading={testingAll}
                disabled={summary.identities.length === 0}
                onClick={() => void testAll()}
            >
                Test all
            </Button>
            {failedCount > 0 && (
                <Text c="red" fz="sm">
                    {failedCount} test requests failed. Retry those users.
                </Text>
            )}
            <ScrollArea>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            {[
                                'Name',
                                'Email',
                                'Snowflake login',
                                'AI user name',
                                'Fingerprint',
                                'Status',
                                'Test',
                            ].map((label) => (
                                <Table.Th key={label}>{label}</Table.Th>
                            ))}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {summary.identities.map((identity) => (
                            <AiTwinIdentityRow
                                key={identity.userUuid}
                                projectUuid={projectUuid}
                                identity={identity}
                                testingAll={testingAll}
                            />
                        ))}
                        {summary.membersWithoutIdentity.map((member) => (
                            <Table.Tr key={member.userUuid}>
                                <Table.Td>
                                    {member.firstName} {member.lastName}
                                </Table.Td>
                                <Table.Td>{member.email}</Table.Td>
                                <Table.Td>—</Table.Td>
                                <Table.Td>—</Table.Td>
                                <Table.Td>—</Table.Td>
                                <Table.Td>
                                    <Badge color="gray">No keys yet</Badge>
                                </Table.Td>
                                <Table.Td>—</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </ScrollArea>
        </Stack>
    );
};
