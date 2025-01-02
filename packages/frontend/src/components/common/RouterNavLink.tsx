import { NavLink, type NavLinkProps } from '@mantine/core';
import { type FC } from 'react';
import {
    NavLink as ReactRouterNavLink,
    useLocation,
    useMatch,
    type NavLinkProps as ReactRouterNavLinkProps,
} from 'react-router';

type RouterNavLinkProps = Omit<NavLinkProps, 'component' | 'active'> & {
    exact?: boolean;
} & Omit<ReactRouterNavLinkProps, 'component'>;

const RouterNavLink: FC<RouterNavLinkProps> = (props) => {
    const location = useLocation();
    const exactMatch = useMatch(props.to.toString());
    const isPartialMatch = location.pathname.startsWith(props.to.toString());
    return (
        <NavLink
            {...props}
            component={ReactRouterNavLink}
            active={props.exact ? !!exactMatch : isPartialMatch}
        />
    );
};

export default RouterNavLink;
