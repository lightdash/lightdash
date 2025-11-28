import { assertUnreachable, capitalize } from '@lightdash/common';
import { Paper, Stack, Text } from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import rehypeExternalLinks from 'rehype-external-links';
import {
    mdEditorComponents,
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../../../../../../utils/markdownUtils';
import type { Operation } from './types';

type ReplaceOperationProps = {
    value: string;
    name: string;
};

const ReplaceOrAddOperation = ({ value, name }: ReplaceOperationProps) => {
    const mdStyle = useMdEditorStyle();

    return (
        <Paper bg="ldGray.0" p="xs" component={Stack} gap="xxs">
            <Text component="code" size="xs" fw={600} c="ldGray.7">
                {capitalize(name)}
            </Text>
            <MDEditor.Markdown
                source={value}
                style={mdStyle}
                rehypeRewrite={rehypeRemoveHeaderLinks}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
                components={mdEditorComponents}
            />
        </Paper>
    );
};

type OperationRendererProps = {
    operation: Operation;
    property: string;
};

export const OperationRenderer = ({
    operation,
    property,
}: OperationRendererProps) => {
    switch (operation.op) {
        case 'replace':
        case 'add':
            return (
                <ReplaceOrAddOperation
                    value={operation.value}
                    name={property}
                />
            );
        default:
            return assertUnreachable(operation, 'Unknown operation type');
    }
};
