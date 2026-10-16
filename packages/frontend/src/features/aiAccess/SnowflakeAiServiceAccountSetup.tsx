import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

const setupSql = `CREATE USER AI_AGENT
  TYPE = SERVICE_AGENT
  RSA_PUBLIC_KEY = '<public key without PEM headers>'
  DEFAULT_ROLE = AI_AGENT_ROLE
  DEFAULT_WAREHOUSE = AI_AGENT_WH;
GRANT ROLE AI_AGENT_ROLE TO USER AI_AGENT;`;

const grantSql = `GRANT USAGE ON WAREHOUSE AI_AGENT_WH TO ROLE AI_AGENT_ROLE;
GRANT USAGE ON DATABASE <database> TO ROLE AI_AGENT_ROLE;
GRANT USAGE ON SCHEMA <database>.<schema> TO ROLE AI_AGENT_ROLE;
GRANT SELECT ON TABLE <database>.<schema>.<table> TO ROLE AI_AGENT_ROLE;`;

export const SnowflakeAiServiceAccountSetup = () => {
    const { t } = useTranslation('aiAccess');
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Snowflake"
            createContent={
                <Stack gap="xs">
                    <CodeBlock
                        language="sql"
                        code={setupSql}
                        copyLabel={t('setupGuide.copySql')}
                    />
                    <Text size="sm" c="dimmed">
                        {t('snowflakeServiceAccountSetup.serviceAgent')}
                    </Text>
                </Stack>
            }
            grantContent={
                <Stack gap="xs">
                    <CodeBlock
                        language="sql"
                        code={grantSql}
                        copyLabel={t('setupGuide.copySql')}
                    />
                    <Text size="sm" c="dimmed">
                        {t('snowflakeServiceAccountSetup.repeatSelect')}
                    </Text>
                </Stack>
            }
            addHelp={t('snowflakeServiceAccountSetup.addHelp')}
        />
    );
};
