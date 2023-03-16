import { Group, Stack, Text, Title } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { FC } from 'react';
import PrimaryLinkButton from '../../common/PrimaryLinkButton';

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
            <PrimaryLinkButton
                href={`/projects/${projectUuid}/tables`}
                leftIcon={<IconTable size={18} />}
            >
                Run a query
            </PrimaryLinkButton>
        </Group>
    );
};

export default LandingPanel;
