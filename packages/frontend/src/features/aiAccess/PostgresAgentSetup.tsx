import {
    buildPostgresAiServiceAccountCommands,
    type PostgresCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const PostgresAgentSetup = ({
    connection,
}: {
    connection: PostgresCredentials;
}) => {
    const { t } = useTranslation('aiAccess');
    const commands = buildPostgresAiServiceAccountCommands({
        dbname: connection.dbname,
        schema: connection.schema,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Postgres"
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        {t('postgresSetup.createRole')}
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={commands.createRole}
                    />
                </Stack>
            }
            grantContent={
                <Stack gap="xs">
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={commands.grantReadAccess}
                    />
                    <Text size="sm" c="dimmed">
                        {t('postgresSetup.grant')}
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={commands.rowLevelSecurity}
                    />
                    <Text size="sm" c="dimmed">
                        {t('postgresSetup.rls')}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {t('postgresSetup.columns')}
                    </Text>
                </Stack>
            }
            addHelp={t('setupGuide.addUserHelp')}
        />
    );
};
