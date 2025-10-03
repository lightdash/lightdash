import {
    assertUnreachable,
    capitalize,
    type ToolProposeChangeOutput,
} from '@lightdash/common';
import { Box, Divider, Paper, Stack, Text } from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import rehypeExternalLinks from 'rehype-external-links';
import {
    mdEditorComponents,
    rehypeRemoveHeaderLinks,
} from '../../../../../../../utils/markdownUtils';
import type { Operation } from './types';

type ReplaceOperationProps = {
    value: string;
    name: string;
    metadata: ToolProposeChangeOutput['metadata'] | null;
};

const ReplaceOrAddOperation: React.FC<ReplaceOperationProps> = ({
    value,
    name,
    metadata,
}) => {
    console.log(metadata && 'originalEntity' in metadata);

    return (
        <Paper bg="gray.0" p="xs" component={Stack} gap="xxs">
            <Text component="code" size="xs" fw={600} c="gray.7">
                {capitalize(name)}
            </Text>

            {metadata && 'originalEntity' in metadata ? (
                <Box
                    component={MDEditor.Markdown}
                    source={metadata.originalEntity?.description ?? 'testing'}
                    fs="md"
                    bg="red.1"
                    p="0"
                    rehypeRewrite={rehypeRemoveHeaderLinks}
                    rehypePlugins={[
                        [rehypeExternalLinks, { target: '_blank' }],
                    ]}
                    components={mdEditorComponents}
                />
            ) : null}

            <Divider />

            <Box
                component={MDEditor.Markdown}
                source={value}
                fs="md"
                bg="green.1"
                p="0"
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
    metadata: ToolProposeChangeOutput['metadata'] | null;
};

export const OperationRenderer = ({
    operation,
    property,
    metadata,
}: OperationRendererProps) => {
    switch (operation.op) {
        case 'replace':
        case 'add':
            return (
                <ReplaceOrAddOperation
                    value={operation.value}
                    name={property}
                    metadata={metadata}
                />
            );
        default:
            return assertUnreachable(operation, 'Unknown operation type');
    }
};
