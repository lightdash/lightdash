import { Button, Group, Popover, Text, TextInput } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState, type FC, type FormEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

const MAX_SOURCE_NAME_LENGTH = 100;

type Props = {
    onRequest: (sourceName: string) => void;
};

/** A button and a line of text; the name is asked for in a popover. */
export const CustomLiveSourceRequestCard: FC<Props> = ({ onRequest }) => {
    const [opened, setOpened] = useState(false);
    const [sourceName, setSourceName] = useState('');
    const [lastRequested, setLastRequested] = useState<string | null>(null);
    const trimmedName = sourceName.trim();

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (trimmedName === '') return;
        onRequest(trimmedName);
        setLastRequested(trimmedName);
        setSourceName('');
        setOpened(false);
    };

    return (
        <Group gap="sm" wrap="nowrap">
            <Popover
                opened={opened}
                onChange={setOpened}
                position="top-start"
                withinPortal
                trapFocus
            >
                <Popover.Target>
                    <Button
                        size="compact-sm"
                        variant="default"
                        onClick={() => setOpened((isOpen) => !isOpen)}
                    >
                        Request a source
                    </Button>
                </Popover.Target>
                <Popover.Dropdown>
                    <form onSubmit={submit}>
                        <Group gap="xs" wrap="nowrap">
                            <TextInput
                                size="xs"
                                w={200}
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
                                disabled={trimmedName === ''}
                            >
                                Request
                            </Button>
                        </Group>
                    </form>
                </Popover.Dropdown>
            </Popover>
            {lastRequested === null ? (
                <Text fz="xs" c="dimmed">
                    Don't see the source you want? Tell us which one you'd
                    connect next.
                </Text>
            ) : (
                <Group gap={4} wrap="nowrap" miw={0}>
                    <MantineIcon icon={IconCheck} size={14} color="green" />
                    <Text fz="xs" c="dimmed" truncate>
                        Requested {lastRequested}
                    </Text>
                </Group>
            )}
        </Group>
    );
};
