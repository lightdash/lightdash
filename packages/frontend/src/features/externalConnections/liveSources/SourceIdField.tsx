import { type ExternalConnection } from '@lightdash/common';
import { Anchor, Stack, Text, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { type useNewSourceId } from '../hooks/useNewSourceId';

type Props = {
    connection: ExternalConnection | null;
    sourceId: ReturnType<typeof useNewSourceId>;
};

/** Editable while adding a source, read-only once it exists. */
export const SourceIdField: FC<Props> = ({ connection, sourceId }) => {
    if (connection) {
        return connection.liveSourceName ? (
            <TextInput
                label="Source ID"
                value={connection.liveSourceName}
                readOnly
                description="Set when the source was created. To use another, delete this source and add a new one."
            />
        ) : null;
    }
    const { value, onChange, error, suggestion, exploreName } = sourceId;
    return (
        <Stack gap={4}>
            <TextInput
                required
                label="Source ID"
                value={value}
                onChange={(event) => onChange(event.currentTarget.value)}
                error={error}
                description={
                    exploreName
                        ? `Charts will refer to it as ${exploreName}. It can't be changed later.`
                        : "Charts refer to this. It can't be changed later."
                }
            />
            {suggestion && (
                <Text fz="xs" c="dimmed">
                    Try{' '}
                    <Anchor
                        component="button"
                        type="button"
                        fz="xs"
                        onClick={() => onChange(suggestion)}
                    >
                        {suggestion}
                    </Anchor>
                </Text>
            )}
        </Stack>
    );
};
