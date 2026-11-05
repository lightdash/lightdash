import { isSquareBrandLogo } from '@lightdash/common';
import { useEffect, useState } from 'react';
import { loadImageSize } from '../../../hooks/organization/brandLogos';

export const useBrandLogoValidation = (url: string | null) => {
    const [result, setResult] = useState<{
        url: string;
        error: string | null;
    } | null>(null);

    useEffect(() => {
        if (!url) return undefined;
        let cancelled = false;
        loadImageSize(url)
            .then(({ width, height }) => {
                if (!cancelled) {
                    setResult({
                        url,
                        error: isSquareBrandLogo(width, height)
                            ? null
                            : 'Use an image with equal width and height',
                    });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setResult({
                        url,
                        error: "Couldn't load this image. Check the URL or choose another file.",
                    });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [url]);

    return {
        isValidating: !!url && result?.url !== url,
        error: result?.url === url ? result.error : null,
    };
};
