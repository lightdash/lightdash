import { IconReload } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { markAppInitiatedReload } from '../../features/appReload/appInitiatedReload';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';

const VersionAutoUpdater: FC = () => {
    const [version, setVersion] = useState<string>();
    const { showToastInfo } = useToaster();
    const { data: healthData } = useHealth({
        refetchInterval: 1200000, // 20 minutes in milliseconds
    });

    useEffect(() => {
        if (healthData) {
            if (!version) {
                setVersion(healthData.version);
            } else if (version !== healthData.version) {
                showToastInfo({
                    key: 'new-version-available',
                    autoClose: false,
                    title: 'A new version of Lightdash is ready for you!',
                    action: {
                        children: 'Use new version',
                        icon: IconReload,
                        onClick: () => {
                            markAppInitiatedReload();
                            window.location.reload();
                        },
                    },
                });
            }
        }
    }, [version, healthData, showToastInfo]);

    return null;
};
export default VersionAutoUpdater;
