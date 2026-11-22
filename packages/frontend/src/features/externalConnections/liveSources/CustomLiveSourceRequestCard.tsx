import {
    Button,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState, type FC, type FormEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import styles from './AddLiveSourceModal.module.css';

const MAX_SOURCE_NAME_LENGTH = 100;

type Props = {
    onRequest: (sourceName: string) => void;
};

/** The last card of the grid; the name is asked for in a popover. */
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
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-start"
            withinPortal
            trapFocus
        >
            <Popover.Target>
                <UnstyledButton
                    className={styles.card}
                    data-request
                    aria-label="Request a live source"
                    onClick={() => setOpened((isOpen) => !isOpen)}
                >
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <span className={styles.requestIcon}>
                            <MantineIcon icon={IconPlus} size={16} />
                        </span>
                        <Stack gap={2} miw={0}>
                            <Text fw={600} fz="sm">
                                Request a live source
                            </Text>
                            <Text fz="xs" c="dimmed" lineClamp={2}>
                                {lastRequested === null
                                    ? "Tell us which one you'd connect next"
                                    : `Requested ${lastRequested}`}
                            </Text>
                        </Stack>
                    </Group>
                </UnstyledButton>
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
    );
};
