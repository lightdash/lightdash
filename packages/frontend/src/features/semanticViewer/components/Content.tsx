import { Box } from '@mantine/core';
import { type FC } from 'react';
import { useAppSelector } from '../store/hooks';
import ResultsViewer from './ResultsViewer';
import SqlViewer from './SqlViewer';

const Content: FC = () => {
    const {
        view,
        selectedDimensions,
        selectedTimeDimensions,
        selectedMetrics,
    } = useAppSelector((state) => state.semanticViewer);

    if (!view) {
        return null;
    }

    if (
        selectedDimensions.length === 0 &&
        selectedTimeDimensions.length === 0 &&
        selectedMetrics.length === 0
    ) {
        return null;
    }

    return (
        <Box w="100%" maw="100%">
            <ResultsViewer />

            <SqlViewer />

            <div>pinned Result table.</div>
        </Box>
    );
};

export default Content;
