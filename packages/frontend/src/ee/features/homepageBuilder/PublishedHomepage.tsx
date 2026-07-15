import { type HomepageBlock, type HomepageConfig } from '@lightdash/common';
import { Box, Group, Stack } from '@mantine-8/core';
import { type FC } from 'react';
import { getBlockDefinition } from './blocks/registry';

// Unknown block types render nothing so newer configs degrade gracefully
const BlockRenderer: FC<{ block: HomepageBlock; projectUuid: string }> = ({
    block,
    projectUuid,
}) => {
    const definition = getBlockDefinition(block.type);
    if (!definition) return null;
    const { View } = definition;
    return <View block={block} projectUuid={projectUuid} />;
};

type Props = {
    config: HomepageConfig;
    projectUuid: string;
};

export const PublishedHomepage: FC<Props> = ({ config, projectUuid }) => (
    <Stack gap="lg" maw={920} mx="auto" w="100%">
        {config.rows.map((row) => (
            <Group key={row.id} gap="md" align="stretch" wrap="nowrap">
                {row.blocks.map((block) => (
                    <Box key={block.id} style={{ flex: 1, minWidth: 0 }}>
                        <BlockRenderer
                            block={block}
                            projectUuid={projectUuid}
                        />
                    </Box>
                ))}
            </Group>
        ))}
    </Stack>
);
