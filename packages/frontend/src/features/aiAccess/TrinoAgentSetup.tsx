import {
    buildTrinoAiServiceAccountCommands,
    type TrinoCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

interface TrinoAgentSetupProps {
    connection: TrinoCredentials;
}

export const TrinoAgentSetup = ({ connection }: TrinoAgentSetupProps) => {
    const { t } = useTranslation('aiAccess');
    const commands = buildTrinoAiServiceAccountCommands(connection);
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Trino"
            createTitle={t('trinoSetup.createTitle')}
            grantTitle={t('trinoSetup.grantTitle')}
            addTitle={t('trinoSetup.addTitle')}
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        {t('trinoSetup.noCreateUser')}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {t('trinoSetup.starburst')}
                    </Text>
                </Stack>
            }
            grantContent={
                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        {t('trinoSetup.fileAccessTitle')}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {t('trinoSetup.fileAccess')}
                    </Text>
                    <CodeBlock
                        language="json"
                        copyLabel={t('trinoSetup.copyRules')}
                        code={commands.accessControlRules}
                    />
                    <Text size="sm" c="dimmed">
                        {t('trinoSetup.replacePlaceholders')}
                    </Text>
                    <Text size="sm" fw={500}>
                        {t('trinoSetup.sqlRolesTitle')}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {t('trinoSetup.sqlRoles')}
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel={t('setupGuide.copySql')}
                        code={commands.grantReadAccess}
                    />
                </Stack>
            }
            addHelp={t('trinoSetup.addHelp')}
        />
    );
};
