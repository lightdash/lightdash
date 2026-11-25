/**
 * The last row of a live data source's Access card: a small read that checks
 * the source can reach its integration. Adding a source and its settings show
 * the same row. The outcome takes the place of the hint: a short green line
 * when it works, the integration's message when it doesn't.
 */
import {
    type ApiError,
    type ExternalConnectionTestResponse,
} from '@lightdash/common';
import { Button, Group, Text } from '@mantine/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsRow } from './LiveSourceSettingsRows';
import classes from './LiveSourceSettingsRows.module.css';

type Props = {
    /** Defaults to "Test authentication", as it reads under a card of credentials. */
    label?: string;
    /** Defaults to "Test". */
    buttonLabel?: string;
    /** What the test reads with, such as the saved settings or the form's. */
    hint: string;
    /** The test mutation, from `useTestConnection` or `useTestConnectionConfig`. */
    test: {
        data?: ExternalConnectionTestResponse;
        error: ApiError | null;
        isLoading: boolean;
        reset: () => void;
    };
    onTest: () => void;
    /** What the test reads with; a change clears the outcome, which no longer applies. */
    inputs: unknown[];
};

type Outcome = { ok: true; message: string } | { ok: false; message: string };

const getOutcome = (
    data: ExternalConnectionTestResponse | undefined,
    error: ApiError | null,
): Outcome | null => {
    if (data) {
        const check = data.liveCheck;
        const ok = check?.ok ?? data.status < 300;
        if (ok) return { ok, message: check?.summary ?? 'Works' };
        return {
            ok,
            message:
                check?.detail ??
                check?.summary ??
                `Failed with status ${data.status}`,
        };
    }
    if (error) return { ok: false, message: error.error.message };
    return null;
};

export const LiveSourceTestRow: FC<Props> = ({
    label = 'Test authentication',
    buttonLabel = 'Test',
    hint,
    test,
    onTest,
    inputs,
}) => {
    const { reset } = test;
    const inputsKey = JSON.stringify(inputs);
    useEffect(() => reset(), [inputsKey, reset]);
    const outcome = test.isLoading ? null : getOutcome(test.data, test.error);
    return (
        <SettingsRow
            label={label}
            hint={
                outcome?.ok ? (
                    <Group
                        gap={4}
                        wrap="nowrap"
                        role="status"
                        c="green"
                        className={classes.testOutcome}
                    >
                        <MantineIcon icon={IconCircleCheckFilled} size={12} />
                        <Text span inherit>
                            {outcome.message}
                        </Text>
                    </Group>
                ) : outcome ? (
                    <Text
                        span
                        inherit
                        role="alert"
                        c="red"
                        className={classes.testOutcome}
                    >
                        {outcome.message}
                    </Text>
                ) : (
                    hint
                )
            }
        >
            <Button
                size="xs"
                variant="default"
                loading={test.isLoading}
                onClick={onTest}
            >
                {buttonLabel}
            </Button>
        </SettingsRow>
    );
};
