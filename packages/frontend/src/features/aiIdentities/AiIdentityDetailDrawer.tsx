import { type AiIdentityFailureReason } from '@lightdash/common';
import {
    Button,
    Divider,
    Drawer,
    Group,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineModal from '../../components/common/MantineModal';
import classes from './AiIdentitiesPage.module.css';
import { AiIdentityDetails } from './AiIdentityDetails';
import { EventStatus, RelativeTime } from './AiIdentityEventDisplay';
import { AiIdentityProblem } from './AiIdentityProblem';
import { aiIdentityApi } from './api';
import { actionLabel, actorLabel } from './eventLabels';

type Props = {
    uuid: string | null;
    onClose: () => void;
    onShowGroup: (reason: AiIdentityFailureReason) => void;
};

export const AiIdentityDetailDrawer: FC<Props> = ({
    uuid,
    onClose,
    onShowGroup,
}) => {
    const [confirmKey, setConfirmKey] = useState(false);
    const [override, setOverride] = useState('');
    const [showReads, setShowReads] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const queryClient = useQueryClient();
    const detailQuery = useQuery({
        queryKey: ['ai-identity-detail', uuid, showReads],
        queryFn: () => aiIdentityApi.detail(uuid!, showReads),
        enabled: !!uuid,
    });
    const identity = detailQuery.data?.identity;

    useEffect(() => {
        setOverride(identity?.twinNameOverride ?? '');
    }, [identity?.twinNameOverride]);

    const runAction = async (action: () => Promise<unknown>) => {
        try {
            setError(null);
            await action();
            await Promise.all([
                queryClient.invalidateQueries(['ai-identity-list']),
                queryClient.invalidateQueries(['ai-identity-detail', uuid]),
                queryClient.invalidateQueries(['ai-identity-accounts']),
            ]);
        } catch {
            setError('Could not update this AI identity. Try again.');
        }
    };

    const saveName = (name: string | null) => {
        if (!identity) return;
        void runAction(() =>
            aiIdentityApi.updateIdentity(identity.aiIdentityUuid, name),
        );
    };

    return (
        <>
            <Drawer
                opened={!!uuid}
                onClose={onClose}
                title={
                    <Title order={4}>
                        {identity
                            ? `${identity.firstName} ${identity.lastName}`
                            : 'AI identity'}
                    </Title>
                }
                position="right"
                size="lg"
            >
                <Stack gap="lg">
                    {detailQuery.isLoading && <EmptyStateLoader />}
                    {detailQuery.isError && (
                        <Callout variant="danger">
                            Could not load this AI identity.
                        </Callout>
                    )}
                    {error && <Callout variant="danger">{error}</Callout>}
                    {identity && (
                        <>
                            <AiIdentityDetails identity={identity} />
                            <AiIdentityProblem
                                identity={identity}
                                fixSql={detailQuery.data?.fixSql ?? null}
                                sameReasonCount={
                                    detailQuery.data?.sameReasonCount ?? 0
                                }
                                onShowGroup={onShowGroup}
                            />
                            <Divider />
                            <Stack gap="xs">
                                <TextInput
                                    label="AI identity name"
                                    description="Use this Snowflake user name for this person instead of the naming template. Leave empty to use the template."
                                    value={override}
                                    onChange={(event) =>
                                        setOverride(event.currentTarget.value)
                                    }
                                    placeholder="From the naming template"
                                    classNames={{ input: classes.identityName }}
                                />
                                <Group justify="flex-end" gap="xs">
                                    {identity.twinNameOverride && (
                                        <Button
                                            variant="subtle"
                                            size="xs"
                                            onClick={() => saveName(null)}
                                        >
                                            Use template
                                        </Button>
                                    )}
                                    <Button
                                        variant="default"
                                        size="xs"
                                        disabled={
                                            (override.trim() || null) ===
                                            identity.twinNameOverride
                                        }
                                        onClick={() =>
                                            saveName(override.trim() || null)
                                        }
                                    >
                                        Save name
                                    </Button>
                                </Group>
                            </Stack>
                            <Divider />
                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Title order={5}>History</Title>
                                    <Switch
                                        size="xs"
                                        label="Show reads"
                                        checked={showReads}
                                        onChange={(event) =>
                                            setShowReads(
                                                event.currentTarget.checked,
                                            )
                                        }
                                    />
                                </Group>
                                {detailQuery.data?.history.length ? (
                                    <Table
                                        striped
                                        highlightOnHover
                                        withTableBorder
                                        verticalSpacing="xs"
                                        fz="sm"
                                    >
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>When</Table.Th>
                                                <Table.Th>What</Table.Th>
                                                <Table.Th>By</Table.Th>
                                                <Table.Th>Result</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {detailQuery.data.history.map(
                                                (event) => (
                                                    <Table.Tr
                                                        key={
                                                            event.aiIdentityEventUuid
                                                        }
                                                    >
                                                        <Table.Td>
                                                            <RelativeTime
                                                                value={
                                                                    event.createdAt
                                                                }
                                                            />
                                                        </Table.Td>
                                                        <Table.Td>
                                                            {actionLabel(
                                                                event.action,
                                                            )}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            {actorLabel(event)}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <EventStatus
                                                                event={event}
                                                            />
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ),
                                            )}
                                        </Table.Tbody>
                                    </Table>
                                ) : (
                                    <Text fz="sm" c="dimmed">
                                        No changes or tests yet.
                                    </Text>
                                )}
                            </Stack>
                            <Group justify="flex-end">
                                <Button
                                    variant="default"
                                    onClick={() => setConfirmKey(true)}
                                >
                                    New key
                                </Button>
                                <Button
                                    onClick={() =>
                                        void runAction(() =>
                                            aiIdentityApi.test(
                                                identity.aiIdentityUuid,
                                            ),
                                        )
                                    }
                                >
                                    Test
                                </Button>
                            </Group>
                        </>
                    )}
                </Stack>
            </Drawer>
            <MantineModal
                opened={confirmKey}
                onClose={() => setConfirmKey(false)}
                title="Create a new key?"
                role="alertdialog"
                description="This AI identity becomes Pending until the new public key is set in Snowflake."
                confirmLabel="Create new key"
                onConfirm={() => {
                    if (!uuid) return;
                    void runAction(() => aiIdentityApi.regenerateKey(uuid));
                    setConfirmKey(false);
                }}
            />
        </>
    );
};
