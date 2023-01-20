import { FC } from 'react';

interface BlueprintLinkProps
    extends React.AnchorHTMLAttributes<HTMLAnchorElement> {}

const BlueprintLink: FC<BlueprintLinkProps> = ({
    children,
    className,
    ...rest
}) => {
    return (
        <a
            className={['bp4-link', className].filter(Boolean).join(' ')}
            {...rest}
        >
            {children}
        </a>
    );
};

export default BlueprintLink;
