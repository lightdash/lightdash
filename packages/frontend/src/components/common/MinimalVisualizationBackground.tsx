import { useEffect, type FC, type PropsWithChildren } from 'react';

const ATTRIBUTE = 'data-lightdash-minimal-visualization';

const MinimalVisualizationBackground: FC<PropsWithChildren> = ({
    children,
}) => {
    useEffect(() => {
        document.documentElement.setAttribute(ATTRIBUTE, '');

        return () => {
            document.documentElement.removeAttribute(ATTRIBUTE);
        };
    }, []);

    return children;
};

export default MinimalVisualizationBackground;
