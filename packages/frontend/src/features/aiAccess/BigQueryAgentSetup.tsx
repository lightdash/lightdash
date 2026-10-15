import {
    buildBigQueryAiServiceAccountCommands,
    type BigqueryCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const BigQueryAgentSetup = ({
    connection,
}: {
    connection: BigqueryCredentials;
}) => {
    const { t } = useTranslation('aiAccess');
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
                    copyLabel={t('setupGuide.copyCommands')}
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
                        copyLabel={t('setupGuide.copyCommands')}
                        code={commands
                            .filter(({ step }) => step !== 'create')
                            .map(({ command }) => command)
                            .join('\n\n')}
                    />
                    {!connection.dataset && (
                        <Text size="sm" c="dimmed">
                            {t('bigquerySetup.grantDataViewer')}
                        </Text>
                    )}
                    <Text size="sm" c="dimmed">
                        {t('setupGuide.grantOnlyVisible')}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {connection.agentMaximumBytesBilled === undefined
                            ? t('bigquerySetup.bytesDefault')
                            : connection.agentMaximumBytesBilled === 0
                              ? t('bigquerySetup.bytesUnlimited')
                              : t('bigquerySetup.bytesLimited', {
                                    bytes: connection.agentMaximumBytesBilled.toLocaleString(),
                                })}
                    </Text>
                </Stack>
            }
            addHelp={t('bigquerySetup.addHelp')}
        />
    );
};
