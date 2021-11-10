import React, { FC } from 'react';
import { Route, useHistory } from 'react-router-dom';
import { MenuItem } from '@blueprintjs/core';

interface Props {
    to: string;
    exact?: boolean;
}

const NavMenuItem: FC<Props & React.ComponentProps<typeof MenuItem>> = ({
    to,
    exact,
    ...rest
}) => {
    const history = useHistory();
    return (
        <Route
            path={to}
            exact={exact}
            /* eslint-disable-next-line react/no-children-prop */
            children={({ match }) => (
                <MenuItem
                    active={!!match}
                    {...rest}
                    onClick={() => history.push(to)}
                />
            )}
        />
    );
};

export default NavMenuItem;
