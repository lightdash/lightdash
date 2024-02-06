import { IconReload } from '@tabler/icons-react';
import { FC, useEffect, useState } from 'react';
import { useRouteMatch } from 'react-router-dom';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';

const routesThatCantBeAutoRefreshed = [
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/saved/:savedQueryUuid/edit',
    '/projects/:projectUuid/dashboards/:dashboardUuid/edit',
    '/projects/:projectUuid/sqlRunner',
];
const VersionAutoUpdater: FC = () => {
    const [version, setVersion] = useState<string>();
    const { showToastPrimary } = useToaster();
    const { data: healthData } = useHealth({
        refetchInterval: 1200000, // 20 minutes in milliseconds
    });
    const isRouteThatCantBeAutoRefreshed = useRouteMatch({
        path: routesThatCantBeAutoRefreshed,
    });

    useEffect(() => {
        if (healthData) {
            if (!version) {
                setVersion(healthData.version);
            } else if (version !== healthData.version) {
                if (isRouteThatCantBeAutoRefreshed) {
                    showToastPrimary({
                        key: 'new-version-available',
                        autoClose: false,
                        title: 'A new version of Lightdash is ready for you!',
                        action: {
                            children: 'Use new version',
                            icon: IconReload,
                            onClick: () => window.location.reload(),
                        },
                    });
                } else {
                    window.location.reload();
                }
            }
        }
    }, [version, isRouteThatCantBeAutoRefreshed, healthData, showToastPrimary]);

    return null;
};
export default VersionAutoUpdater;
