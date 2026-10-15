import {
    buildAthenaAiServiceAccountCommands,
    type AthenaCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const AthenaAgentSetup = ({
    connection,
}: {
    connection: AthenaCredentials;
}) => {
    const { t } = useTranslation('aiAccess');
    const commands = buildAthenaAiServiceAccountCommands({
        region: connection.region,
        catalog: connection.database,
        database: connection.schema,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Athena"
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        {t('athenaSetup.createWorkgroup')}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {t('athenaSetup.iamUser')}
                    </Text>
                    <Text size="sm" fw={500}>
                        {t('athenaSetup.permissionPolicy')}
                    </Text>
                    <CodeBlock
                        language="json"
                        copyLabel={t('athenaSetup.copyPermissionPolicy')}
                        code={commands.permissionPolicy}
                    />
                    <Text size="sm" c="dimmed">
                        {t('athenaSetup.attachPolicy')}
                    </Text>
                    <Text size="sm" fw={500}>
                        {t('athenaSetup.roleTrustPolicy')}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {t('athenaSetup.roleInstead')}
                    </Text>
                    <CodeBlock
                        language="json"
                        copyLabel={t('athenaSetup.copyRoleTrustPolicy')}
                        code={commands.roleTrustPolicy}
                    />
                </Stack>
            }
            grantContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        {t('athenaSetup.lakeFormationAdmin')}
                    </Text>
                    <Text size="sm" fw={500}>
                        {t('athenaSetup.lakeFormationGrant')}
                    </Text>
                    <CodeBlock
                        language="bash"
                        copyLabel={t('athenaSetup.copyLakeFormationGrant')}
                        code={commands.lakeFormationGrants}
                    />
                    <Text size="sm" c="dimmed">
                        {t('athenaSetup.dataFilter')}
                    </Text>
                    <Text size="sm" fw={500}>
                        {t('athenaSetup.filteredTableGrant')}
                    </Text>
                    <CodeBlock
                        language="bash"
                        copyLabel={t('athenaSetup.copyFilteredTableGrant')}
                        code={commands.filteredTableGrant}
                    />
                </Stack>
            }
            addHelp={t('athenaSetup.addHelp')}
        />
    );
};
