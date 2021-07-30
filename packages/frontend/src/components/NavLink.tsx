import React, { FC } from 'react';
import { Link, Route } from 'react-router-dom';

interface Props {
    to: string;
    exact?: boolean;
}

const NavLink: FC<Props> = ({ to, exact, children }) => (
    <Route
        path={to}
        exact={exact}
        /* eslint-disable-next-line react/no-children-prop */
        children={({ match }) => {
            const isActive = !!match;
            return (
                <Link to={to}>
                    {typeof children === 'function'
                        ? children(isActive)
                        : React.Children.map(children, (child) => {
                              if (React.isValidElement(child)) {
                                  return React.cloneElement(child, {
                                      active: isActive,
                                  });
                              }
                              return child;
                          })}
                </Link>
            );
        }}
    />
);

export default NavLink;
