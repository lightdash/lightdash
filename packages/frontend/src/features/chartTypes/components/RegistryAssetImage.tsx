import { useEffect, useState, type FC, type ReactNode } from 'react';
import { registryAssetUrl } from '../utils/registryAssetUrl';

type Props = {
    path: string;
    alt: string;
    className?: string;
    /** Rendered instead of the image when it fails to load. */
    fallback: ReactNode;
    onLoadError?: () => void;
};

// Registry assets stream through the backend proxy, which fails when the
// registry itself is unreachable — render a quiet fallback instead of the
// browser's broken-image glyph.
const RegistryAssetImage: FC<Props> = ({
    path,
    alt,
    className,
    fallback,
    onLoadError,
}) => {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [path]);
    if (failed) return <>{fallback}</>;
    return (
        <img
            src={registryAssetUrl(path)}
            alt={alt}
            className={className}
            onError={() => {
                setFailed(true);
                onLoadError?.();
            }}
        />
    );
};

export default RegistryAssetImage;
