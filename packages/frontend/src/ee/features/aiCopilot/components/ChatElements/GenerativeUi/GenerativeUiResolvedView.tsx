import {
    assertUnreachable,
    toolGenerateUiArgsSchema,
    type GenerativeUiState,
    type ToolGenerateUiMetadata,
} from '@lightdash/common';
import { Badge, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconForms } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { fieldsOf, formatFieldValue, isVisible } from './fields';

type OutcomeStatus = Exclude<ToolGenerateUiMetadata['status'], 'error'>;

const badgeByStatus = {
    success: { color: 'green', label: 'Done' },
    failed: { color: 'red', label: 'Failed' },
    dismissed: { color: 'gray', label: 'Skipped' },
} satisfies Record<OutcomeStatus, { color: string; label: string }>;

const Summary: FC<{
    toolArgs: unknown;
    status: OutcomeStatus;
    state: GenerativeUiState;
}> = ({ toolArgs, status, state }) => {
    const spec = useMemo(() => {
        const parsed = toolGenerateUiArgsSchema.safeParse(toolArgs);
        return parsed.success ? parsed.data : null;
    }, [toolArgs]);
    const fields = useMemo(
        () =>
            spec === null
                ? []
                : fieldsOf(spec.blocks).filter((field) =>
                      isVisible(field.visibleWhen, state),
                  ),
        [spec, state],
    );
    const badge = badgeByStatus[status];

    return (
        <Paper p="md">
            <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconForms} color="indigo.5" />
                        <Title order={5}>{spec?.title ?? 'Form'}</Title>
                    </Group>
                    <Badge color={badge.color}>{badge.label}</Badge>
                </Group>
                {fields.map((field) => (
                    <Group key={field.key} gap="xs" wrap="nowrap">
                        <Text fz="xs" c="dimmed">
                            {field.label}
                        </Text>
                        <Text fz="xs">
                            {formatFieldValue(field, state[field.key])}
                        </Text>
                    </Group>
                ))}
            </Stack>
        </Paper>
    );
};

/** A finished card, read-only: what the user submitted and how it ended. */
export const GenerativeUiResolvedView: FC<{
    toolArgs: unknown;
    metadata: ToolGenerateUiMetadata;
}> = ({ toolArgs, metadata }) => {
    switch (metadata.status) {
        case 'error':
            return (
                <Text fz="xs" c="dimmed">
                    The form could not be shown.
                </Text>
            );
        case 'success':
        case 'failed':
        case 'dismissed':
            return (
                <Summary
                    toolArgs={toolArgs}
                    status={metadata.status}
                    state={metadata.state}
                />
            );
        default:
            return assertUnreachable(metadata, 'Unknown generateUi status');
    }
};
