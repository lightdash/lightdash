import { Group, Stack, Text, Title } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { FC } from 'react';
import MantineLinkButton from '../../common/MantineLinkButton';

interface Props {
    userName: string | undefined;
    projectUuid: string;
}

const LandingPanel: FC<Props> = ({ userName, projectUuid }) => {
    return (
        <Group position="apart" my="xl" pt="xl">
            <Stack justify="flex-start" spacing="xs">
                <Title order={3}>
                    {`Welcome${userName ? ', ' + userName : ' to Lightdash'}!`}{' '}
                    ⚡️
                </Title>
                <Text color="gray.7">
                    Run a query to ask a business question or browse your data
                    below:
                </Text>
            </Stack>
            <MantineLinkButton href={`/projects/${projectUuid}/tables`}>
                Run a query
            </MantineLinkButton>
        </Group>
    );
};

export default LandingPanel;
