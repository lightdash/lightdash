import {
    ActionIcon,
    Box,
    Divider,
    Flex,
    Group,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { ResizableBox } from 'react-resizable';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_MIN_WIDTH,
} from '../../../components/common/Page/Sidebar';
import { useSqlRunnerProvider } from '../providers/SqlRunnerProvider';
import { TableFields } from './TableFields';
import { Tables } from './Tables';

import 'react-resizable/css/styles.css';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const Sidebar: FC<Props> = ({ setSidebarOpen }) => {
    const { projectUuid } = useSqlRunnerProvider();

    return (
        <Stack h="100vh" spacing="xs">
            <Group position="apart">
                <Title order={5} fz="sm" c="gray.6">
                    SQL RUNNER
                </Title>
                <Tooltip variant="xs" label="Close sidebar" position="left">
                    <ActionIcon size="xs">
                        <MantineIcon
                            icon={IconArrowLeft}
                            onClick={() => setSidebarOpen(false)}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Flex direction="column" justify="space-between" h="100%">
                <Box>
                    <Tables projectUuid={projectUuid} />
                </Box>
                <Box pos="relative">
                    <ResizableBox
                        height={400}
                        minConstraints={[SIDEBAR_MIN_WIDTH, 100]}
                        maxConstraints={[SIDEBAR_MAX_WIDTH, 500]}
                        resizeHandles={['n']}
                        axis="y"
                        handle={
                            <Divider
                                h={3}
                                bg="gray.3"
                                pos="absolute"
                                top={-2}
                                left={0}
                                right={0}
                                sx={{
                                    cursor: 'ns-resize',
                                }}
                            />
                        }
                    >
                        <TableFields />
                    </ResizableBox>
                </Box>
            </Flex>
        </Stack>
    );
};
