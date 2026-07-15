import {
    assertUnreachable,
    type HomepageBlock,
    type HomepageConfig,
} from '@lightdash/common';
import { Box, Group, Stack, useMantineColorScheme } from '@mantine-8/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';

const BlockRenderer: FC<{ block: HomepageBlock }> = ({ block }) => {
    const { colorScheme } = useMantineColorScheme();
    switch (block.type) {
        case 'markdown':
            return (
                <Box data-color-mode={colorScheme} w="100%">
                    <MarkdownPreview
                        source={block.config.content}
                        rehypePlugins={[
                            [rehypeExternalLinks, { target: '_blank' }],
                        ]}
                    />
                </Box>
            );
        default:
            return assertUnreachable(block.type, 'Unknown homepage block');
    }
};

type Props = {
    config: HomepageConfig;
    projectUuid: string;
};

export const PublishedHomepage: FC<Props> = ({ config }) => (
    <Stack gap="lg" maw={920} mx="auto" w="100%">
        {config.rows.map((row) => (
            <Group key={row.id} gap="md" align="stretch" wrap="nowrap">
                {row.blocks.map((block) => (
                    <Box key={block.id} style={{ flex: 1, minWidth: 0 }}>
                        <BlockRenderer block={block} />
                    </Box>
                ))}
            </Group>
        ))}
    </Stack>
);
