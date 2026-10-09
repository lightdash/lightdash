import {
    buildBigQueryAiServiceAccountCommands,
    type BigqueryCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const BigQueryAgentSetup = ({
    connection,
    hasKey,
    tested,
}: {
    connection: BigqueryCredentials;
    hasKey: boolean;
    tested: boolean;
}) => {
    const commands = buildBigQueryAiServiceAccountCommands({
        project: connection.project,
        executionProject: connection.executionProject || null,
        dataset: connection.dataset || null,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="BigQuery"
            hasAccount={hasKey}
            tested={tested}
            createContent={
                <CodeBlock
                    language="bash"
                    copyLabel="Copy commands"
                    code={commands
                        .filter(({ step }) => step === 'create')
                        .map(({ command }) => command)
                        .join('\n\n')}
                />
            }
            grantContent={
                <Stack gap="xs">
                    <CodeBlock
                        language="bash"
                        copyLabel="Copy commands"
                        code={commands
                            .filter(({ step }) => step !== 'create')
                            .map(({ command }) => command)
                            .join('\n\n')}
                    />
                    {!connection.dataset && (
                        <Text size="sm" c="dimmed">
                            Grant Data Viewer on each dataset agents may read.
                        </Text>
                    )}
                    <Text size="sm" c="dimmed">
                        Grant only the data every agent user may see.
                    </Text>
                </Stack>
            }
            addHelp="Create a JSON key for the account, upload it here, then select Test."
        />
    );
};
