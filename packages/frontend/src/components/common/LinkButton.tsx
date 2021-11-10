import { AnchorButton } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';

const LinkButton: FC<
    { href: string } & React.ComponentProps<typeof AnchorButton>
> = ({ href, ...rest }) => {
    const history = useHistory();
    return (
        <AnchorButton
            {...rest}
            href={href}
            onClick={(e) => {
                e.preventDefault();
                history.push(href);
            }}
        />
    );
};

export default LinkButton;
