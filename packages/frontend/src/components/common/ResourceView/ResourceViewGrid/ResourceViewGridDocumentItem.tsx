import type { ResourceViewDocumentItem } from '@lightdash/common';
import { Box, Group, Paper, Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { ResourceIcon } from '../../ResourceIcon';
import TruncatedText from '../../TruncatedText';
import ResourceViewActionMenu, {
    type ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import ResourceLastEdited from '../ResourceLastEdited';
import classes from './ResourceViewGridItem.module.css';

const ResourceViewGridDocumentItem = ({
    item,
    onAction,
    allowDelete,
    dragIcon,
}: ResourceViewActionMenuCommonProps & {
    item: ResourceViewDocumentItem;
    dragIcon: ReactNode;
    allowDelete?: boolean;
}) => (
    <Paper className={classes.gridCard} h="100%">
        <Stack gap="md">
            <Group wrap="nowrap">
                {dragIcon}
                <ResourceIcon item={item} />
                <TruncatedText maxWidth="100%" fw={600}>
                    {item.data.name}
                </TruncatedText>
            </Group>
            {item.data.description && (
                <Text lineClamp={2} c="dimmed">
                    {item.data.description}
                </Text>
            )}
            <Group justify="space-between">
                <ResourceLastEdited item={item} />
                <Box
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                >
                    <ResourceViewActionMenu
                        item={item}
                        onAction={onAction}
                        allowDelete={allowDelete}
                    />
                </Box>
            </Group>
        </Stack>
    </Paper>
);

export default ResourceViewGridDocumentItem;
