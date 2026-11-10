import {
    buildBigQueryAiServiceAccountCommands,
    type BigqueryCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const BigQueryAgentSetup = ({
    connection,
}: {
    connection: BigqueryCredentials;
}) => {
    const commands = buildBigQueryAiServiceAccountCommands({
        project: connection.project,
        executionProject: connection.executionProject || null,
        dataset: connection.dataset || null,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="BigQuery"
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
                    <Text size="sm" c="dimmed">
                        {connection.agentMaximumBytesBilled === undefined
                            ? 'Agent queries use the connection maximum bytes billed. Set an agent limit in the project connection settings.'
                            : connection.agentMaximumBytesBilled === 0
                              ? 'Agent queries have no maximum bytes billed. Change this in the project connection settings.'
                              : `Agent queries are limited to ${connection.agentMaximumBytesBilled.toLocaleString()} bytes billed. Change this in the project connection settings.`}
                    </Text>
                </Stack>
            }
            addHelp="Create a JSON key for the account, upload it here, then select Test."
        />
    );
};
