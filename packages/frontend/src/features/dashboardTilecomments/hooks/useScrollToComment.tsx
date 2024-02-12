import { useMantineTheme } from '@mantine/core';
import { RefObject, useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

export const useScrollToComment = (ref: RefObject<HTMLDivElement>) => {
    const [hasScrolledToElement, setHasScrolledToElement] = useState(false);
    const theme = useMantineTheme();
    const history = useHistory();
    const location = useLocation();

    const queryParams = useMemo(
        () => new URLSearchParams(location.search),
        [location.search],
    );

    useEffect(() => {
        // if (isDashboardLoading) return;

        setTimeout(() => {
            const dashboardTileUuid = queryParams.get('dashboardTileUuid');

            if (dashboardTileUuid) {
                // const element = document.getElementById(
                //     `container-${dashboardTileUuid}`,
                // );

                if (ref.current) {
                    ref.current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });

                    setHasScrolledToElement(true);

                    ref.current.animate(
                        [
                            { borderColor: 'white' },
                            {
                                borderColor: theme.colors.blue[4],
                            },
                            { borderColor: 'white' },
                        ],
                        {
                            duration: 2500,
                            iterations: 4,
                        },
                    );
                }
            }
        }, 2000);
    }, [location, queryParams, ref, theme.colors.blue]);

    useEffect(() => {
        if (hasScrolledToElement) {
            queryParams.delete('dashboardTileUuid');
            history.replace({
                pathname: location.pathname,
                search: queryParams.toString(),
            });
        }
    }, [hasScrolledToElement, history, location.pathname, queryParams]);
};
