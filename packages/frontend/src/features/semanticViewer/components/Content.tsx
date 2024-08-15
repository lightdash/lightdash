import { Flex } from '@mantine/core';
import { type FC } from 'react';
import { useAppSelector } from '../store/hooks';
import ResultsViewer from './ResultsViewer';

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
        <Flex direction="column" w="100%" maw="100%" h="100%" mah="100%">
            <ResultsViewer />
        </Flex>
    );
};

export default Content;
