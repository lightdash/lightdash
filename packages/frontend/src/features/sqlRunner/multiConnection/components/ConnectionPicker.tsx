import { Select } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { useTrackedConnectionSwitch } from '../hooks/useTrackedConnectionSwitch';

export const ConnectionPicker: FC = () => {
    const { t } = useTranslation('sqlRunner');
    const { connections, hasSeveralConnections, activeConnectionUuid } =
        useActiveConnection();
    const switchConnection = useTrackedConnectionSwitch();

    const data = useMemo(
        () =>
            connections.map((connection) => ({
                value: connection.warehouseConnectionUuid,
                label: connection.name,
            })),
        [connections],
    );

    if (!hasSeveralConnections) return null;

    return (
        <Select
            size="sm"
            data={data}
            value={activeConnectionUuid ?? null}
            placeholder={t('connection.choose')}
            allowDeselect={false}
            aria-label={t('connectionHeader.activeConnection')}
            leftSection={<MantineIcon icon={IconPlugConnected} />}
            onChange={(value) => {
                if (value) switchConnection(value, 'picker');
            }}
        />
    );
};
