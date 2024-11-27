import { ReactFlow } from '@xyflow/react';
import { type FC } from 'react';

import { Box } from '@mantine/core';
import '@xyflow/react/dist/style.css';

const initialNodes = [
    { id: '1', position: { x: 0, y: 0 }, data: { label: '1' } },
    { id: '2', position: { x: 0, y: 100 }, data: { label: '2' } },
];
const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }];

const MetricTree: FC = () => {
    return (
        <Box w="100%" h="100%">
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                fitView
                attributionPosition="top-right"
            />
        </Box>
    );
};

export default MetricTree;
