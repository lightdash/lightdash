import { AnchorButton } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';

const LinkButton: FC<
    { href: string } & React.ComponentProps<typeof AnchorButton>
> = ({ href, target, ...rest }) => {
    const history = useHistory();
    return (
        <AnchorButton
            {...rest}
            href={href}
            target={target}
            onClick={(e) => {
                if (target === '_blank') return;
                e.preventDefault();
                history.push(href);
            }}
        />
    );
};

export default LinkButton;
