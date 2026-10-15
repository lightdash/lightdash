import { IconReload } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';

const VersionAutoUpdater: FC = () => {
    const { t } = useTranslation('app');
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
                    title: t('versionAutoUpdater.title'),
                    action: {
                        children: t('versionAutoUpdater.action'),
                        icon: IconReload,
                        onClick: () => window.location.reload(),
                    },
                });
            }
        }
    }, [version, healthData, showToastInfo, t]);

    return null;
};
export default VersionAutoUpdater;
