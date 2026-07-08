import { Center } from '@mantine-8/core';
import { IconLock } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

/** Shown in place of a tile's content while filter requirements are unmet. */
const LockedTilePlaceholder: FC = () => (
    <Center h="100%">
        <MantineIcon icon={IconLock} size="xl" color="ldGray.4" />
    </Center>
);

export default LockedTilePlaceholder;
