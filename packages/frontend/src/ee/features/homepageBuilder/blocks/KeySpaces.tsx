import { Box, Text } from '@mantine-8/core';
import { IconFolder, IconFolders } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { type KeySpace } from '../hooks/rankKeySpaces';
import { BlockHeader, IconSquare } from './BlockShell';
import classes from './blockStyles.module.css';
import { PageGrid, PageGridItem } from './PageGrid';

const itemLabel = (count: number) => `${count} item${count === 1 ? '' : 's'}`;

const KeySpaceCard: FC<{ space: KeySpace; projectUuid: string }> = ({
    space,
    projectUuid,
}) => (
    <Link
        to={`/projects/${projectUuid}/spaces/${space.uuid}`}
        className={`${classes.hoverCard} ${classes.clickable} ${classes.plainLink} ${classes.contentTile}`}
    >
        <IconSquare icon={IconFolder} />
        <Box className={classes.tileBody}>
            <Text size="sm" fw={600} truncate>
                {space.name}
            </Text>
            <Text size="xs" c="dimmed">
                {itemLabel(space.itemCount)}
            </Text>
        </Box>
    </Link>
);

/** The spaces a viewer should start from. Renders nothing when the project has
 * none with content — an empty header is worse than no section. */
export const KeySpaces: FC<{
    spaces: KeySpace[];
    projectUuid: string;
    title?: string;
}> = ({ spaces, projectUuid, title = 'Spaces' }) => {
    if (spaces.length === 0) return null;
    return (
        <Box>
            <BlockHeader icon={IconFolders} title={title} />
            <PageGrid itemSpan={3}>
                {spaces.map((space) => (
                    <PageGridItem key={space.uuid}>
                        <KeySpaceCard space={space} projectUuid={projectUuid} />
                    </PageGridItem>
                ))}
            </PageGrid>
        </Box>
    );
};
