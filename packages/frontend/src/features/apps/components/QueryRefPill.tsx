import { ActionIcon, Box, Text } from '@mantine/core';
import { IconRoute, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { type QueryRef } from '../utils/queryRefs';
import classes from './ElementRefPill.module.css';

/** A query reference added from the lineage view, removable in the composer. */
export const QueryRefPill: FC<{ queryRef: QueryRef; onRemove: () => void }> = ({
    queryRef,
    onRemove,
}) => (
    <Box className={classes.pill}>
        <MantineIcon icon={IconRoute} size={12} color="violet.6" />
        <Text fw={500} truncate className={classes.label}>
            {queryRef.title}
        </Text>
        <ActionIcon
            size="xs"
            radius="xl"
            onClick={onRemove}
            aria-label={`Remove ${queryRef.title}`}
        >
            <MantineIcon icon={IconX} size={10} />
        </ActionIcon>
    </Box>
);
