import { IconReload } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';

const VersionAutoUpdater: FC = () => {
    const [version, setVersion] = useState<string>();
    const { showToastPrimary } = useToaster();
    const { data: healthData } = useHealth({
        refetchInterval: 1200000, // 20 minutes in milliseconds
    });

    useEffect(() => {
        if (healthData) {
            if (!version) {
                setVersion(healthData.version);
            } else if (version !== healthData.version) {
                showToastPrimary({
                    key: 'new-version-available',
                    autoClose: false,
                    title: `A new version of ${healthData.siteName} is ready for you!`,
                    action: {
                        children: 'Use new version',
                        icon: IconReload,
                        onClick: () => window.location.reload(),
                    },
                });
            }
        }
    }, [version, healthData, showToastPrimary]);

    return null;
};
export default VersionAutoUpdater;
