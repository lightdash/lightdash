import {
    buildDatabricksAiServiceAccountCommands,
    type DatabricksCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const DatabricksAgentSetup = ({
    connection,
}: {
    connection: DatabricksCredentials;
}) => {
    const { t } = useTranslation('aiAccess');
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Databricks"
            createContent={
                <Text size="sm" c="dimmed">
                    {t('databricksSetup.create')}
                </Text>
            }
            grantContent={
                <Stack gap="xs">
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={buildDatabricksAiServiceAccountCommands({
                            catalog: connection.catalog || null,
                            schema: connection.database || null,
                        })}
                    />
                    <Text size="sm" c="dimmed">
                        {t('databricksSetup.grant')}
                    </Text>
                </Stack>
            }
            addHelp={t('databricksSetup.addHelp')}
        />
    );
};
