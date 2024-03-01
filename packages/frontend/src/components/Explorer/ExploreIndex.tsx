import { Button, Center, Group, Text } from '@mantine/core';
import { FC } from 'react';
import { Link, useParams } from 'react-router-dom';

const ExploreIndex: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return (
        <Center style={{ flex: 1 }}>
            <Group spacing="sm">
                <Text>Start exploring or</Text>
                <Button
                    compact
                    component={Link}
                    to={`/projects/${projectUuid}/explore/new`}
                >
                    create a new explore
                </Button>
            </Group>
        </Center>
    );
};

export default ExploreIndex;
