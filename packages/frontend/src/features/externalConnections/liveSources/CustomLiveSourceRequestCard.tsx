import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState, type FC, type FormEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import styles from './AddLiveSourceModal.module.css';

const MAX_SOURCE_NAME_LENGTH = 100;

type Props = {
    onRequest: (sourceName: string) => void;
};

export const CustomLiveSourceRequestCard: FC<Props> = ({ onRequest }) => {
    const [sourceName, setSourceName] = useState('');
    const [lastRequested, setLastRequested] = useState<string | null>(null);
    const trimmedName = sourceName.trim();

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (trimmedName === '') {
            return;
        }
        onRequest(trimmedName);
        setLastRequested(trimmedName);
        setSourceName('');
    };

    return (
        <form className={styles.card} data-requestable onSubmit={submit}>
            <Stack gap="xs">
                <Stack gap={2}>
                    <Text fw={600} fz="sm">
                        Don't see the source you want?
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Tell us which one you'd connect next.
                    </Text>
                </Stack>
                <Group gap="xs" wrap="nowrap">
                    <TextInput
                        flex={1}
                        size="xs"
                        aria-label="Source name"
                        placeholder="Source name"
                        maxLength={MAX_SOURCE_NAME_LENGTH}
                        value={sourceName}
                        onChange={(event) =>
                            setSourceName(event.currentTarget.value)
                        }
                    />
                    <Button
                        type="submit"
                        size="xs"
                        variant="default"
                        disabled={trimmedName === ''}
                    >
                        Request
                    </Button>
                </Group>
                {lastRequested !== null && (
                    <Group gap={4} wrap="nowrap">
                        <MantineIcon icon={IconCheck} size={14} color="green" />
                        <Text fz="xs" c="dimmed" truncate>
                            Requested {lastRequested}
                        </Text>
                    </Group>
                )}
            </Stack>
        </form>
    );
};
