import {
    type ContentDraftFieldResolution,
    type ContentDraftStaleness,
    type ContentDraftStalenessDetails,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    SegmentedControl,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { useState, type FC } from 'react';
import { draftFieldLabel } from '../utils/draftFieldLabel';
import classes from './DraftStalePanel.module.css';

type DraftStaleAlertProps = {
    contentLabel: 'dashboard' | 'chart';
    staleness: ContentDraftStaleness;
    details: ContentDraftStalenessDetails | null | undefined;
    isUpdating: boolean;
    onUpdate: (
        resolutions: Record<string, ContentDraftFieldResolution>,
    ) => void;
};

// Shown to the author when the repo published past the snapshot their draft
// started from; the panel says what each side did before asking anything
const DraftStaleAlert: FC<DraftStaleAlertProps> = ({
    contentLabel,
    staleness,
    details,
    isUpdating,
    onUpdate,
}) => {
    const [reviewing, setReviewing] = useState(false);
    const [resolutions, setResolutions] = useState<
        Record<string, ContentDraftFieldResolution>
    >({});
    const conflicts = staleness.conflictingFields;
    const hasConflicts = conflicts.length > 0;
    const undecided = conflicts.some(
        (field) => resolutions[field] === undefined,
    );
    const changes = details?.changes ?? [];

    return (
        <Box className={classes.panel} mx="md" mt="md">
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap={2}>
                        <Group gap={8} wrap="nowrap">
                            <span className={classes.dot} />
                            <Text size="sm" fw={600}>
                                This {contentLabel} changed in the repo since
                                your draft
                            </Text>
                        </Group>
                        <Text size="sm" c="dimmed">
                            {hasConflicts
                                ? `You both changed ${conflicts
                                      .map((field) =>
                                          draftFieldLabel(field).toLowerCase(),
                                      )
                                      .join(
                                          ', ',
                                      )}. Pick which version to keep; everything else carries over.`
                                : 'Your edits do not overlap with it, so they carry over as they are.'}
                        </Text>
                    </Stack>
                    {!reviewing ? (
                        <Button
                            size="xs"
                            loading={isUpdating}
                            onClick={() =>
                                hasConflicts ? setReviewing(true) : onUpdate({})
                            }
                        >
                            {hasConflicts
                                ? 'Review changes'
                                : 'Update to latest'}
                        </Button>
                    ) : null}
                </Group>
                {reviewing ? (
                    <Stack gap="sm">
                        <Table
                            className={classes.table}
                            withRowBorders={false}
                            verticalSpacing={6}
                            horizontalSpacing="sm"
                        >
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th w={130}>Field</Table.Th>
                                    <Table.Th>In the repo</Table.Th>
                                    <Table.Th>In your draft</Table.Th>
                                    <Table.Th w={190}>Keep</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {changes.map((change) => {
                                    const conflicting = conflicts.includes(
                                        change.field,
                                    );
                                    return (
                                        <Table.Tr key={change.field}>
                                            <Table.Td>
                                                <Text size="sm" fw={500}>
                                                    {draftFieldLabel(
                                                        change.field,
                                                    )}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text size="sm">
                                                    {change.repo}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text
                                                    size="sm"
                                                    c={
                                                        conflicting
                                                            ? undefined
                                                            : 'dimmed'
                                                    }
                                                >
                                                    {change.mine ?? 'unchanged'}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                {conflicting ? (
                                                    <SegmentedControl
                                                        size="xs"
                                                        value={
                                                            resolutions[
                                                                change.field
                                                            ] ?? ''
                                                        }
                                                        onChange={(value) =>
                                                            setResolutions(
                                                                (current) => ({
                                                                    ...current,
                                                                    [change.field]:
                                                                        value ===
                                                                        'latest'
                                                                            ? 'latest'
                                                                            : 'mine',
                                                                }),
                                                            )
                                                        }
                                                        data={[
                                                            {
                                                                label: 'Mine',
                                                                value: 'mine',
                                                            },
                                                            {
                                                                label: 'Repo',
                                                                value: 'latest',
                                                            },
                                                        ]}
                                                    />
                                                ) : (
                                                    <Text size="xs" c="dimmed">
                                                        Repo version,
                                                        automatically
                                                    </Text>
                                                )}
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                        <Group justify="flex-end" gap="xs">
                            <Button
                                size="xs"
                                variant="subtle"
                                color="gray"
                                onClick={() => setReviewing(false)}
                            >
                                Not now
                            </Button>
                            <Button
                                size="xs"
                                loading={isUpdating}
                                disabled={undecided || details === undefined}
                                onClick={() => onUpdate(resolutions)}
                            >
                                Update draft
                            </Button>
                        </Group>
                    </Stack>
                ) : null}
            </Stack>
        </Box>
    );
};

export default DraftStaleAlert;
