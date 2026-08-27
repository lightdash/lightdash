import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
    selectIsFieldSidebarOpen,
    useExplorerSelector,
} from '../features/explorer/store';

export const FIELD_SIDEBAR_PARAM = 'fieldSidebar';
const FIELD_SIDEBAR_CLOSED_VALUE = 'closed';

export const parseIsFieldSidebarOpen = (search: string): boolean =>
    new URLSearchParams(search).get(FIELD_SIDEBAR_PARAM) !==
    FIELD_SIDEBAR_CLOSED_VALUE;

export const useExplorerSidebarUrlState = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const isFieldSidebarOpen = useExplorerSelector(selectIsFieldSidebarOpen);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const currentValue = searchParams.get(FIELD_SIDEBAR_PARAM);
        const nextValue = isFieldSidebarOpen
            ? null
            : FIELD_SIDEBAR_CLOSED_VALUE;

        if (currentValue === nextValue) return;

        if (nextValue === null) {
            searchParams.delete(FIELD_SIDEBAR_PARAM);
        } else {
            searchParams.set(FIELD_SIDEBAR_PARAM, nextValue);
        }

        void navigate(
            {
                pathname: location.pathname,
                search: searchParams.toString(),
                hash: location.hash,
            },
            { replace: true },
        );
    }, [
        isFieldSidebarOpen,
        location.hash,
        location.pathname,
        location.search,
        navigate,
    ]);
};
