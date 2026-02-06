import { NavLink, type NavLinkProps } from '@mantine-8/core';
import { type FC } from 'react';
import {
    NavLink as ReactRouterNavLink,
    useLocation,
    useMatch,
    type NavLinkProps as ReactRouterNavLinkProps,
} from 'react-router';

type RouterNavLinkProps = Omit<NavLinkProps, 'component' | 'active'> & {
    exact?: boolean;
} & Omit<ReactRouterNavLinkProps, 'component' | 'end'>;

const RouterNavLink: FC<RouterNavLinkProps> = ({ exact, ...props }) => {
    const location = useLocation();
    const exactMatch = useMatch(props.to.toString());
    const isPartialMatch = location.pathname.startsWith(props.to.toString());
    return (
        <NavLink
            {...props}
            component={ReactRouterNavLink}
            active={exact ? !!exactMatch : isPartialMatch}
            // Pass 'end' to React Router's NavLink to sync its active state
            // When end=true, NavLink only matches exact paths (no partial matching)
            end={exact}
        />
    );
};

export default RouterNavLink;
