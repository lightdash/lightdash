import { Button, Group, Text, TextInput } from '@mantine/core';
import { IconCheck, IconPlus } from '@tabler/icons-react';
import { useEffect, useState, type FC, type FormEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

const MAX_SOURCE_NAME_LENGTH = 100;
const CONFIRMATION_MS = 2500;

type Step =
    | { kind: 'closed'; isDismissed: boolean }
    | { kind: 'typing' }
    | { kind: 'sent'; sourceName: string };

type Props = {
    onRequest: (sourceName: string) => void;
};

/** Below the grid: a button that turns into an input, then a confirmation. */
export const CustomLiveSourceRequest: FC<Props> = ({ onRequest }) => {
    const [step, setStep] = useState<Step>({
        kind: 'closed',
        isDismissed: false,
    });
    const [sourceName, setSourceName] = useState('');
    const trimmedName = sourceName.trim();

    useEffect(() => {
        if (step.kind !== 'sent') return undefined;
        const timeout = setTimeout(
            () => setStep({ kind: 'closed', isDismissed: false }),
            CONFIRMATION_MS,
        );
        return () => clearTimeout(timeout);
    }, [step]);

    const close = (isDismissed: boolean) => {
        setSourceName('');
        setStep({ kind: 'closed', isDismissed });
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (trimmedName === '') return;
        onRequest(trimmedName);
        setSourceName('');
        setStep({ kind: 'sent', sourceName: trimmedName });
    };

    return (
        // One height for every step, so the dialog doesn't jump
        <Group justify="center" mih={30}>
            {step.kind === 'closed' && (
                <Button
                    // Escape hands focus back; leaving the input doesn't
                    autoFocus={step.isDismissed}
                    variant="transparent"
                    color="gray"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    onClick={() => setStep({ kind: 'typing' })}
                >
                    Request a live data source
                </Button>
            )}
            {step.kind === 'typing' && (
                <form onSubmit={submit}>
                    <Group gap="xs" wrap="nowrap">
                        <TextInput
                            autoFocus
                            size="xs"
                            w={240}
                            aria-label="Source name"
                            placeholder="Which tool?"
                            maxLength={MAX_SOURCE_NAME_LENGTH}
                            value={sourceName}
                            // Escape closes the input, not the dialog
                            data-mantine-stop-propagation="true"
                            onChange={(event) =>
                                setSourceName(event.currentTarget.value)
                            }
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') close(true);
                            }}
                            onBlur={() => {
                                if (trimmedName === '') close(false);
                            }}
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
            )}
            {step.kind === 'sent' && (
                <Group gap={6} wrap="nowrap" miw={0} role="status">
                    <MantineIcon icon={IconCheck} color="green" />
                    <Text fz="xs" c="dimmed" truncate>
                        Requested {step.sourceName}. Thanks!
                    </Text>
                </Group>
            )}
        </Group>
    );
};
