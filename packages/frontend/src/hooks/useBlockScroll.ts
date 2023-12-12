import { useEffect } from 'react';

const preventScroll = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
};

export const usePreventScroll = (prevent: boolean = true) => {
    useEffect(() => {
        if (prevent) {
            window.addEventListener('wheel', preventScroll, { passive: false });
            window.addEventListener('touchmove', preventScroll, {
                passive: false,
            });
        } else {
            window.removeEventListener('wheel', preventScroll);
            window.removeEventListener('touchmove', preventScroll);
        }

        return () => {
            window.removeEventListener('wheel', preventScroll);
            window.removeEventListener('touchmove', preventScroll);
        };
    }, [prevent]);
};
