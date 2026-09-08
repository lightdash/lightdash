import { Text } from '@mantine/core';
import { type FC } from 'react';
import useHealth from '../../../hooks/health/useHealth';

// Shown inside the SSH section so the bastion admin sees the IP to allow
// next to the host field, not at the top of the page.
export const SshStaticIpHint: FC = () => {
    const health = useHealth();
    const staticIp = health.data?.staticIp;
    if (!staticIp) return null;
    return (
        <Text fz="xs" c="dimmed">
            Lightdash connects to this host from <b>{staticIp}</b>. Allow
            inbound SSH from that IP on the bastion.
        </Text>
    );
};
