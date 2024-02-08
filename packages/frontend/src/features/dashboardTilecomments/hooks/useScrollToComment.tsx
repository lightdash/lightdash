import { useMantineTheme } from '@mantine/core';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const useScrollToComment = () => {
    const theme = useMantineTheme();
    const location = useLocation();

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const dashboardTileUuid = queryParams.get('dashboardTileUuid');

        if (dashboardTileUuid) {
            const element = document.getElementById(dashboardTileUuid);

            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });

                element.animate(
                    [
                        { borderColor: 'white' },
                        { borderColor: theme.colors.blue[4] },
                        { borderColor: 'white' },
                    ],
                    {
                        duration: 1500,
                        iterations: 4,
                    },
                );
            }
            queryParams.delete('dashboardTileUuid');
        }
    }, [location, theme.colors.blue]);
};
