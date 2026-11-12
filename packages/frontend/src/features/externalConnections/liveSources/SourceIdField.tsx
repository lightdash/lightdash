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
                label="Explore prefix"
                value={connection.liveSourceName}
                readOnly
                description="Used by Lightdash to name this source's explores. Can't be changed."
            />
        ) : null;
    }
    const { value, onChange, error, suggestion } = sourceId;
    return (
        <Stack gap={4}>
            <TextInput
                required
                label="Explore prefix"
                value={value}
                onChange={(event) => onChange(event.currentTarget.value)}
                error={error}
                description="Used by Lightdash to name this source's explores. Can't be changed later."
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
