import { Text } from '@mantine/core';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import useHealth from '../../../hooks/health/useHealth';

// Shown inside the SSH section so the bastion admin sees the IP to allow
// next to the host field, not at the top of the page.
export const SshStaticIpHint: FC = () => {
    const { t } = useTranslation('projectConnection');
    const health = useHealth();
    const staticIp = health.data?.staticIp;
    if (!staticIp) return null;
    return (
        <Text fz="xs" c="dimmed">
            <Trans
                t={t}
                i18nKey="sshStaticIpHint.description"
                values={{ ip: staticIp }}
                components={{ ip: <Text component="span" inherit fw={600} /> }}
            />
        </Text>
    );
};
