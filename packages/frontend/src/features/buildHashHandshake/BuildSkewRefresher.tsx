import { useEffect, useRef, type FC } from 'react';
import { useLocation } from 'react-router';
import { refreshForBuildSkew } from './buildHashHandshake';

const BuildSkewRefresher: FC = () => {
    const { pathname } = useLocation();
    const previousPathname = useRef(pathname);

    useEffect(() => {
        if (previousPathname.current === pathname) {
            return;
        }

        previousPathname.current = pathname;
        refreshForBuildSkew();
    }, [pathname]);

    return null;
};

export default BuildSkewRefresher;
