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
import { useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { ResizableBox } from 'react-resizable';
import MantineIcon from '../../../components/common/MantineIcon';
import { Tables } from './Tables';

import 'react-resizable/css/styles.css';
import { TableFields } from './TableFields';

type Props = {
    projectUuid: string;
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const Sidebar: FC<Props> = ({ projectUuid, setSidebarOpen }) => {
    const [activeTable, setActiveTable] = useState<string | undefined>();

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
                    <Tables
                        activeTable={activeTable}
                        setActiveTable={setActiveTable}
                        projectUuid={projectUuid}
                    />
                </Box>
                <Box pos="relative">
                    <ResizableBox
                        width={Infinity}
                        height={400}
                        minConstraints={[Infinity, 100]}
                        maxConstraints={[Infinity, 500]}
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
                        <TableFields
                            projectUuid={projectUuid}
                            activeTable={activeTable}
                        />
                    </ResizableBox>
                </Box>
            </Flex>
        </Stack>
    );
};
