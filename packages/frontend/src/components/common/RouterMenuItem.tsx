import { MenuItem2 } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import { Route, useHistory } from 'react-router-dom';

interface Props {
    to: string;
    exact?: boolean;
}

const RouterMenuItem: FC<Props & React.ComponentProps<typeof MenuItem2>> = ({
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
                <MenuItem2
                    active={!!match}
                    {...rest}
                    onClick={() => history.push(to)}
                />
            )}
        />
    );
};

export default RouterMenuItem;
