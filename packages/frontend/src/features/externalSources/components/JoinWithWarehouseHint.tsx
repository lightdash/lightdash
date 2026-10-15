import { Button } from '@mantine/core';
import { IconGitMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';

/**
 * The discoverable path from an uploaded table to a cross-source join: one
 * quiet button under the explore header that opens the merge flow with this
 * table as the primary source.
 */
export const JoinWithWarehouseHint: FC<{ onClick: () => void }> = ({
    onClick,
}) => {
    const { t } = useTranslation('sync');
    return (
        <Button
            variant="light"
            size="compact-xs"
            leftSection={<MantineIcon icon={IconGitMerge} size="sm" />}
            onClick={onClick}
        >
            {t('externalSources.joinWithWarehouse')}
        </Button>
    );
};
