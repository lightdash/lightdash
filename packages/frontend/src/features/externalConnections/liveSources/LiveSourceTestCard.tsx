/**
 * Checks that a live data source can read from its integration with a small
 * read. Adding a source and its settings show the same card, right below
 * Access. The outcome takes the place of the hint: a short green line when it
 * works, the integration's message when it doesn't.
 */
import {
    type ApiError,
    type ExternalConnectionTestResponse,
} from '@lightdash/common';
import { Button, Group, Text } from '@mantine/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import classes from './LiveSourceSettingsRows.module.css';

type Props = {
    /** What the test reads with, such as the saved settings or the form's. */
    hint: string;
    /** The test mutation, from `useTestConnection` or `useTestConnectionConfig`. */
    test: {
        data?: ExternalConnectionTestResponse;
        error: ApiError | null;
        isLoading: boolean;
    };
    onTest: () => void;
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

export const LiveSourceTestCard: FC<Props> = ({ hint, test, onTest }) => {
    const outcome = test.isLoading ? null : getOutcome(test.data, test.error);
    return (
        <SettingsCard title="Test">
            <SettingsRow
                label="Test access"
                hint={
                    outcome?.ok ? (
                        <Group
                            gap={4}
                            wrap="nowrap"
                            role="status"
                            c="green"
                            className={classes.testOutcome}
                        >
                            <MantineIcon
                                icon={IconCircleCheckFilled}
                                size={12}
                            />
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
                    Test
                </Button>
            </SettingsRow>
        </SettingsCard>
    );
};
