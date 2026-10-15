import {
    buildRedshiftAiServiceAccountCommands,
    type RedshiftCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

interface RedshiftAgentSetupProps {
    connection: RedshiftCredentials;
}

export const RedshiftAgentSetup = ({ connection }: RedshiftAgentSetupProps) => {
    const { t } = useTranslation('aiAccess');
    const commands = buildRedshiftAiServiceAccountCommands({
        schema: connection.schema,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Redshift"
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        {t('redshiftSetup.createUser')}
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
                        {t('redshiftSetup.grant')}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {t('redshiftSetup.policies')}
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={commands.rowLevelSecurity}
                    />
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={commands.masking}
                    />
                    <Text size="sm" c="dimmed">
                        {t('redshiftSetup.warning')}
                    </Text>
                </Stack>
            }
            addHelp={t('setupGuide.addUserHelp')}
        />
    );
};
