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
                description="Lightdash names this source's explores with it. It never changes, so saved charts keep working. To use another, delete this source and add a new one."
            />
        ) : null;
    }
    const { value, onChange, error, suggestion, exploreName } = sourceId;
    return (
        <Stack gap={4}>
            <TextInput
                required
                label="Explore prefix"
                value={value}
                onChange={(event) => onChange(event.currentTarget.value)}
                error={error}
                description={`Lightdash names this source's explores with it${
                    exploreName ? `, e.g. ${exploreName}` : ''
                }. Keep the default if it's your only source of this type. It never changes, so saved charts keep working and reattaching reuses it.`}
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
