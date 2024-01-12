import { Alert, Stack, Text } from '@mantine/core';
import { IconExclamationCircle, IconInfoCircle } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const DbtLocalForm: FC = () => (
    <Stack>
        <Alert
            color="orange"
            icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
        >
            <Text color="orange">
                This connection type should only be used for local development.
            </Text>
        </Alert>

        <Alert
            color="blue"
            icon={<MantineIcon icon={IconInfoCircle} size="lg" />}
        >
            <Stack spacing="xs">
                <Text color="blue">
                    When using the install script, when you&apos;re asked{' '}
                    <b>How do you want to setup Lightdash ?</b>, select the
                    option <b>with local dbt</b> and then provide the absolute
                    path to your dbt project.
                </Text>

                <Text color="blue">
                    When using the install script, set the env var{' '}
                    <b>DBT_PROJECT_DIR</b> with the absolute path to your dbt
                    project.
                </Text>
            </Stack>
        </Alert>
    </Stack>
);

export default DbtLocalForm;
