import {
    buildClickhouseAiServiceAccountCommands,
    type ClickhouseCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

interface ClickhouseAgentSetupProps {
    connection: ClickhouseCredentials;
}

export const ClickhouseAgentSetup = ({
    connection,
}: ClickhouseAgentSetupProps) => {
    const { t } = useTranslation('aiAccess');
    const commands = buildClickhouseAiServiceAccountCommands({
        schema: connection.schema,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="ClickHouse"
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        {t('clickhouseSetup.createUser')}
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={commands.createUser}
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
                        {t('clickhouseSetup.grant')}
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={commands.rowPolicy}
                    />
                </Stack>
            }
            addHelp={t('clickhouseSetup.addHelp')}
        />
    );
};
