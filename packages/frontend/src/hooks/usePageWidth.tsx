import { useCallback, useEffect, useState, type RefObject } from 'react';

const usePageWidth = (ref?: RefObject<HTMLElement> | null) => {
    const getWidth = useCallback(() => {
        return ref?.current ? ref.current.offsetWidth : window.innerWidth;
    }, [ref]);

    const [width, setWidth] = useState(getWidth);

    useEffect(() => {
        const handleResize = () => setWidth(getWidth());
        window.addEventListener('resize', handleResize);

        // Set the initial width
        setWidth(getWidth());

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [getWidth]);

    return width;
};

export default usePageWidth;
