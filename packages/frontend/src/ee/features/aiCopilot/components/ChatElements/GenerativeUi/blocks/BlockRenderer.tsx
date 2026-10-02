import {
    assertUnreachable,
    type GenerativeUiBlock,
    type GenerativeUiLeafBlock,
} from '@lightdash/common';
import { Divider, Group, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../../../../../../components/common/Callout';
import { isVisible } from '../fields';
import { FieldBlock } from './FieldBlock';
import { type GenerativeUiRenderContext } from './renderContext';
import { TableBlock } from './TableBlock';

type TextVariant = NonNullable<
    Extract<GenerativeUiLeafBlock, { type: 'text' }>['variant']
>;

const textColorByVariant = {
    body: undefined,
    dimmed: 'dimmed',
} satisfies Record<TextVariant, string | undefined>;

const LeafBlock: FC<{
    block: GenerativeUiLeafBlock;
    context: GenerativeUiRenderContext;
}> = ({ block, context }) => {
    if (!isVisible(block.visibleWhen, context.state)) return null;
    switch (block.type) {
        case 'heading':
            return <Title order={6}>{block.text}</Title>;
        case 'text':
            return (
                <Text fz="sm" c={textColorByVariant[block.variant ?? 'body']}>
                    {block.text}
                </Text>
            );
        case 'callout':
            return <Callout variant={block.variant}>{block.text}</Callout>;
        case 'divider':
            return <Divider />;
        case 'textInput':
        case 'textarea':
        case 'numberInput':
        case 'checkbox':
        case 'dateInput':
        case 'select':
        case 'multiSelect':
        case 'segmented':
            return <FieldBlock block={block} context={context} />;
        case 'table':
            return <TableBlock block={block} context={context} />;
        default:
            return assertUnreachable(block, 'Unknown generative UI block type');
    }
};

const Block: FC<{
    block: GenerativeUiBlock;
    context: GenerativeUiRenderContext;
}> = ({ block, context }) => {
    switch (block.type) {
        case 'stack':
            return (
                <Stack gap={block.gap ?? 'sm'}>
                    <BlockList blocks={block.children} context={context} />
                </Stack>
            );
        case 'group':
            return (
                <Group gap="sm" grow={block.grow} align="flex-start">
                    <BlockList blocks={block.children} context={context} />
                </Group>
            );
        case 'heading':
        case 'text':
        case 'callout':
        case 'divider':
        case 'textInput':
        case 'textarea':
        case 'numberInput':
        case 'checkbox':
        case 'dateInput':
        case 'select':
        case 'multiSelect':
        case 'segmented':
        case 'table':
            return <LeafBlock block={block} context={context} />;
        default:
            return assertUnreachable(block, 'Unknown generative UI block type');
    }
};

/** Renders spec blocks in order; the spec is fixed, so positions are stable keys. */
export const BlockList: FC<{
    blocks: GenerativeUiBlock[];
    context: GenerativeUiRenderContext;
}> = ({ blocks, context }) => (
    <>
        {blocks.map((block, index) => (
            <Block
                key={`${index}:${block.type}`}
                block={block}
                context={context}
            />
        ))}
    </>
);
