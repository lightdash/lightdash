import { Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    paramKey: string;
};

export const ShadowedReservedNameWarning: FC<Props> = ({ paramKey }) => {
    const { t } = useTranslation('explorer');
    return (
        <Tooltip
            position="top"
            maw={350}
            label={t('parameters.shadowedReservedName', { paramKey })}
        >
            <MantineIcon size="sm" icon={IconAlertTriangle} color="yellow.7" />
        </Tooltip>
    );
};
