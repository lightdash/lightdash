import { Center } from '@mantine-8/core';
import { IconFilterExclamation } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

/** Shown in place of a tile's content while filter requirements are unmet. */
const UnmetRequirementsPlaceholder: FC = () => (
    <Center h="100%" w="100%" data-testid="unmet-requirements-placeholder">
        <MantineIcon icon={IconFilterExclamation} size="xl" color="ldGray.4" />
    </Center>
);

export default UnmetRequirementsPlaceholder;
