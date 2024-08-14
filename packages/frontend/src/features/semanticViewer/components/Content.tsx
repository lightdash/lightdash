import { Flex } from '@mantine/core';
import { type FC } from 'react';
import { useAppSelector } from '../store/hooks';
import { selectAllSelectedFieldNames } from '../store/selectors';
import ResultsViewer from './ResultsViewer';

const Content: FC = () => {
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);

    if (allSelectedFieldNames.length === 0) return null;

    return (
        <Flex direction="column" w="100%" maw="100%" h="100%" mah="100%">
            <ResultsViewer />
        </Flex>
    );
};

export default Content;
