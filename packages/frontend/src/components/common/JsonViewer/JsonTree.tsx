import { JsonViewer, type JsonViewerProps } from '@mantine/code-highlight';
import { type FC } from 'react';

// Matches react-json-view's array grouping instead of truncating at 100
const JsonTree: FC<JsonViewerProps> = (props) => (
    <JsonViewer
        fontSize="xs"
        withSize
        withChevrons
        groupArraysAfterLength={100}
        maxDisplayLength={Number.POSITIVE_INFINITY}
        {...props}
    />
);

export default JsonTree;
