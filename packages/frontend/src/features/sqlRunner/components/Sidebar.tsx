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
import 'react-resizable/css/styles.css';
import MantineIcon from '../../../components/common/MantineIcon';
import { ColumnsList } from './ColumnsList';
import { TablesList } from './TablesList';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const Sidebar: FC<Props> = ({ setSidebarOpen }) => {
    return (
        <Stack h="100vh">
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
                    <TablesList />
                </Box>
                <Box pos="relative">
                    <ResizableBox
                        width={Infinity}
                        height={200}
                        minConstraints={[Infinity, 100]}
                        maxConstraints={[Infinity, 400]}
                        resizeHandles={['n']}
                        axis="y"
                        handle={
                            <Divider
                                h={3}
                                bg="gray.4"
                                pos="absolute"
                                top={-5}
                                left={0}
                                right={0}
                                sx={{
                                    cursor: 'ns-resize',
                                }}
                            />
                        }
                    >
                        <ColumnsList />
                    </ResizableBox>
                </Box>
            </Flex>
        </Stack>
    );
};
