import {
    Avatar,
    Box,
    Button,
    Center,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowLeft, IconLock, IconRobot } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';

const AiAgentsNotAuthorizedPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return (
        <AiAgentPageLayout>
            <Center h="80%">
                <Stack align="center" maw="480px">
                    <Box pos="relative">
                        <Avatar size={80} color="gray">
                            <MantineIcon
                                icon={IconRobot}
                                size={48}
                                strokeWidth={1.5}
                            />
                        </Avatar>
                        <Box
                            pos="absolute"
                            bottom={0}
                            right={0}
                            bg="white"
                            p={4}
                            style={{
                                borderRadius: '50%',
                                border: '1px solid #e0e0e0',
                            }}
                        >
                            <MantineIcon
                                icon={IconLock}
                                size={18}
                                color="yellow"
                                strokeWidth={1.5}
                            />
                        </Box>
                    </Box>

                    <Title order={3} ta="center">
                        You're not authorized to interact with this AI agent
                    </Title>
                    <Paper p="md" shadow="subtle" w="100%">
                        <Stack align="center" gap="xs">
                            <Text size="xs" c="dimmed" ta="center">
                                To gain access, please contact your organization
                                administrator.
                            </Text>
                            <Button
                                variant="subtle"
                                color="gray"
                                leftSection={
                                    <MantineIcon icon={IconArrowLeft} />
                                }
                                component={Link}
                                to={`/projects/${projectUuid}/home`}
                            >
                                Go back to project home
                            </Button>
                        </Stack>
                    </Paper>
                </Stack>
            </Center>
        </AiAgentPageLayout>
    );
};

export default AiAgentsNotAuthorizedPage;
