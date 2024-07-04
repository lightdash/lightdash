import {
    ActionIcon,
    Box,
    Divider,
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

    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
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

            <Stack sx={{ flex: 1, overflow: 'hidden' }}>
                <Tables
                    activeTable={activeTable}
                    setActiveTable={setActiveTable}
                    projectUuid={projectUuid}
                />

                {activeTable && (
                    <Box pos="relative">
                        <ResizableBox
                            height={DEFAULT_RESIZABLE_BOX_HEIGHT_PX}
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
                )}
            </Stack>
        </Stack>
    );
};
