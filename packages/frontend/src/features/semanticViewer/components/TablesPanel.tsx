import { Box, Divider } from '@mantine/core';
import { ResizableBox } from 'react-resizable';
import {
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_MIN_WIDTH,
} from '../../../components/common/Page/Sidebar';

import 'react-resizable/css/styles.css';

const DEFAULT_RESIZABLE_BOX_HEIGHT_PX = 250;
const MIN_RESIZABLE_BOX_HEIGHT_PX = 150;
const MAX_RESIZABLE_BOX_HEIGHT_PX = 500;

export const TablesPanel = () => {
    return (
        <>
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
                    views list...
                </ResizableBox>
            </Box>
        </>
    );
};
