/**
 * Checks that a live data source can read from its integration: a small read
 * with its access settings, and what came back. Adding a source and its
 * settings show the same card, right below Access.
 */
import {
    type ApiError,
    type ExternalConnectionTestResponse,
} from '@lightdash/common';
import { Box, Button, Group, Text } from '@mantine/core';
import { IconAlertCircleFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ConnectionTestResult } from '../components/ConnectionTestResult';
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

/** A request the server refused, such as a key that may not go to a new region. */
const TestError: FC<{ message: string }> = ({ message }) => (
    <Group gap="xs" wrap="nowrap" align="flex-start" role="alert" c="red">
        <MantineIcon
            icon={IconAlertCircleFilled}
            className={classes.testErrorIcon}
        />
        <Text fz="sm">{message}</Text>
    </Group>
);

export const LiveSourceTestCard: FC<Props> = ({ hint, test, onTest }) => {
    const result = test.isLoading ? null : test.data ? (
        <ConnectionTestResult response={test.data} />
    ) : test.error ? (
        <TestError message={test.error.error.message} />
    ) : null;
    return (
        <SettingsCard title="Test">
            <SettingsRow label="Test access" hint={hint}>
                <Button
                    size="xs"
                    variant="default"
                    loading={test.isLoading}
                    onClick={onTest}
                >
                    Test
                </Button>
            </SettingsRow>
            {result ? <Box className={classes.testResult}>{result}</Box> : null}
        </SettingsCard>
    );
};
