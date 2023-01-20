import { Colors } from '@blueprintjs/core';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import BlueprintLink from '../BlueprintLink';

const AnchorLink: FC<{ href: string; onClick?: () => void }> = ({
    href,
    onClick,
    children,
    ...rest
}) => {
    const history = useHistory();
    return (
        <BlueprintLink
            {...rest}
            href={href}
            onClick={(e) => {
                e.preventDefault();
                history.push(href);
                onClick?.();
            }}
            style={{
                color: Colors.BLUE4,
            }}
        >
            {children}
        </BlueprintLink>
    );
};

export default AnchorLink;
