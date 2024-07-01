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
import {
    useEffect,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';
import MantineIcon from '../../../components/common/MantineIcon';
import { getTables } from '../mock';
import { TableFieldsList } from './TableFieldsList';
import { TablesList } from './TablesList';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const Sidebar: FC<Props> = ({ setSidebarOpen }) => {
    useEffect(() => {
        return () => {
            console.log('cleanup');
        };
    }, []);
    const [activeTable, setActiveTable] = useState<string | undefined>();
    const [activeFields, setActiveFields] = useState<Set<string> | undefined>();
    // TODO: remove mock data
    const tables = Object.keys(getTables().results.postgres.jaffle);
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
                    <TablesList
                        activeTable={activeTable}
                        setActiveTable={setActiveTable}
                        tables={tables}
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
                        <TableFieldsList
                            activeFields={activeFields}
                            setActiveFields={setActiveFields}
                            activeTable={activeTable}
                        />
                    </ResizableBox>
                </Box>
            </Flex>
        </Stack>
    );
};
