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
import { IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import { useState, type Dispatch, type FC, type SetStateAction } from 'react';
import { ResizableBox } from 'react-resizable';
import MantineIcon from '../../../components/common/MantineIcon';
import { Tables } from './Tables';

import 'react-resizable/css/styles.css';
import {
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_MIN_WIDTH,
} from '../../../components/common/Page/Sidebar';
import { TableFields } from './TableFields';

type Props = {
    projectUuid: string;
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

const DEFAULT_RESIZABLE_BOX_HEIGHT_PX = 250;
const MIN_RESIZABLE_BOX_HEIGHT_PX = 150;
const MAX_RESIZABLE_BOX_HEIGHT_PX = 500;

export const Sidebar: FC<Props> = ({ projectUuid, setSidebarOpen }) => {
    const [activeTable, setActiveTable] = useState<string | undefined>();
    const [resizableBoxHeight, setResizableBoxHeight] = useState(
        DEFAULT_RESIZABLE_BOX_HEIGHT_PX,
    );

    return (
        <Stack h="100%" spacing="xs">
            <Group position="apart">
                <Title order={5} fz="sm" c="gray.6">
                    SQL RUNNER
                </Title>
                <Tooltip variant="xs" label="Close sidebar" position="left">
                    <ActionIcon size="xs">
                        <MantineIcon
                            icon={IconLayoutSidebarLeftCollapse}
                            onClick={() => setSidebarOpen(false)}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Flex direction="column" justify="space-between" h="100%">
                <Box
                    sx={{
                        height: `calc(100% - ${resizableBoxHeight}px)`,
                        overflowY: 'hidden',
                    }}
                >
                    <Tables
                        activeTable={activeTable}
                        setActiveTable={setActiveTable}
                        projectUuid={projectUuid}
                    />
                </Box>
                <Box pos="relative">
                    <ResizableBox
                        height={resizableBoxHeight}
                        minConstraints={[
                            SIDEBAR_MIN_WIDTH,
                            MIN_RESIZABLE_BOX_HEIGHT_PX,
                        ]}
                        maxConstraints={[
                            SIDEBAR_MAX_WIDTH,
                            MAX_RESIZABLE_BOX_HEIGHT_PX,
                        ]}
                        resizeHandles={['n']}
                        axis="y"
                        onResize={(_, data) =>
                            setResizableBoxHeight(data.size.height)
                        }
                        handle={
                            <Divider
                                h={5}
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
