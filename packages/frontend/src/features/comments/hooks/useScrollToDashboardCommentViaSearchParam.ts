import { useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export const useScrollToDashboardCommentViaSearchParam = ({
    ref,
    enabled,
    dashboardTileUuid,
    onScrolled,
}: {
    ref: React.MutableRefObject<HTMLDivElement | null>;
    enabled: boolean;
    dashboardTileUuid: string;
    onScrolled: () => void;
}) => {
    const [isSuccess, setIsSuccess] = useState(false);
    // get search with uselocation param tile uuid
    const { search } = useLocation();
    const searchParams = new URLSearchParams(search);
    const tileUuid = searchParams.get('tileUuid');

    useLayoutEffect(() => {
        if (
            !isSuccess &&
            tileUuid === dashboardTileUuid &&
            ref.current &&
            enabled
        ) {
            onScrolled();
            setTimeout(() => {
                if (ref.current)
                    ref.current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                setIsSuccess(true);
            }, 200);
        }
    }, [tileUuid, dashboardTileUuid, enabled, ref, onScrolled, isSuccess]);
};
