const BlueprintParagraph = ({
    children,
    className,
    ...rest
}: React.AnchorHTMLAttributes<HTMLParagraphElement>) => {
    return (
        <p
            className={['bp4-paragraph', className].filter(Boolean).join(' ')}
            {...rest}
        >
            {children}
        </p>
    );
};

export default BlueprintParagraph;
