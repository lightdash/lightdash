import { Anchor } from '@mantine/core';
import React, { CSSProperties, FC } from 'react';
import { Link, Route } from 'react-router-dom';

interface Props {
    to: string;
    style?: CSSProperties;
    exact?: boolean;
}

const NavLink: FC<Props> = ({ to, style, exact, children }) => (
    <Route
        path={to}
        exact={exact}
        /* eslint-disable-next-line react/no-children-prop */
        children={({ match }) => {
            const isActive = match?.isExact;

            return (
                <Anchor component={Link} to={to} style={style}>
                    {typeof children === 'function'
                        ? children(isActive)
                        : React.Children.map(children, (child) => {
                              if (React.isValidElement(child)) {
                                  return React.cloneElement(
                                      child as React.ReactElement,
                                      {
                                          active: isActive,
                                      },
                                  );
                              }
                              return child;
                          })}
                </Anchor>
            );
        }}
    />
);

export default NavLink;
