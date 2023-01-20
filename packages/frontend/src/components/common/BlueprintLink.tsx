const BlueprintLink = ({
    children,
    className,
    ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
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
