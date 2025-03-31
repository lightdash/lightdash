import { Anchor, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconBrandGithub } from '@tabler/icons-react';
import MantineIcon from '../../common/MantineIcon';

export const CreatedPullRequestModalContent = ({
    onClose,
    data,
}: {
    onClose: () => void;
    data: { prUrl: string };
}) => {
    return (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconBrandGithub}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>Write back to dbt</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md">
                <Text>
                    Your pull request{' '}
                    <Anchor href={data.prUrl} target="_blank" span fw={700}>
                        #{data.prUrl.split('/').pop()}
                    </Anchor>{' '}
                    was successfully created on Github.
                    <Text pt="md">
                        Once it is merged, refresh your dbt connection to see
                        your updated metrics and dimensions.
                    </Text>
                </Text>
            </Stack>
            <Group position="right" w="100%" p="md">
                <Button
                    color="gray.7"
                    onClick={onClose}
                    variant="outline"
                    size="xs"
                >
                    Close
                </Button>
            </Group>
        </Modal>
    );
};
