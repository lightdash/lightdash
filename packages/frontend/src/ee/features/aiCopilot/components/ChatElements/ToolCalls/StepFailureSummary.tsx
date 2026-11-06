import { Button, Code, Group, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconTerminal2 } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import { useAiAgentSqlModeAvailable } from '../../../hooks/useAiAgentSqlModeAvailable';
import styles from './StepFailureSummary.module.css';
import { type FinalStepFailure } from './utils/getFinalStepFailure';

/** The error a turn ended on, as one readable block above the answer. */
export const StepFailureSummary: FC<{
    failure: FinalStepFailure;
    projectUuid: string;
}> = ({ failure, projectUuid }) => {
    const getUiString = useUiStrings();
    const canOpenSqlRunner = useAiAgentSqlModeAvailable(projectUuid);
    const sqlRunnerState = canOpenSqlRunner ? failure.sqlRunnerLinkState : null;
    return (
        <Stack gap={6} className={styles.summary}>
            <Group gap={6} wrap="nowrap" className={styles.title}>
                <MantineIcon
                    icon={IconAlertCircle}
                    size={14}
                    className={styles.icon}
                />
                <Text component="span" fz="sm" fw={500} c="red">
                    {getUiString('aiAgent.stepFailure.title')}
                </Text>
                <Text component="span" fz="sm" c="dimmed" truncate>
                    {`· ${failure.stepLabel}`}
                </Text>
                {sqlRunnerState && (
                    <Button
                        component={Link}
                        to={{ pathname: `/projects/${projectUuid}/sql-runner` }}
                        state={sqlRunnerState}
                        size="compact-xs"
                        variant="default"
                        className={styles.action}
                        leftSection={
                            <MantineIcon icon={IconTerminal2} size={12} />
                        }
                    >
                        {getUiString('aiAgent.stepFailure.openInSqlRunner')}
                    </Button>
                )}
            </Group>
            {failure.failures
                .filter((item) => item.message !== '')
                .map((item) => (
                    <Code key={item.toolCallId} block className={styles.error}>
                        {item.message}
                    </Code>
                ))}
        </Stack>
    );
};
