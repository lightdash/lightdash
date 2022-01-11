import { AnchorButton } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';

const AnchorLink: FC<
    { href: string } & React.ComponentProps<typeof AnchorButton>
> = ({ href, children, ...rest }) => {
    const history = useHistory();
    return (
        <a
            {...rest}
            href={href}
            onClick={(e) => {
                e.preventDefault();
                history.push(href);
            }}
        >
            {children}
        </a>
    );
};

export default AnchorLink;
