import { Colors } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';

const AnchorLink: FC<{ href: string }> = ({ href, children, ...rest }) => {
    const history = useHistory();
    return (
        <a
            {...rest}
            href={href}
            onClick={(e) => {
                e.preventDefault();
                history.push(href);
            }}
            style={{
                color: Colors.BLUE4,
            }}
        >
            {children}
        </a>
    );
};

export default AnchorLink;
