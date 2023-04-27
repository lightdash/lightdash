import { useEffect, useState } from 'react';

const useHeadway = () => {
    const [isHeadwayLoaded, setIsHeadwayLoaded] = useState(false);

    useEffect(() => {
        if (isHeadwayLoaded) return;

        const script = document.createElement('script');
        script.async = false;
        script.src = 'https://cdn.headwayapp.co/widget.js';
        document.head.appendChild(script);

        script.onload = () => {
            setIsHeadwayLoaded(true);
        };
    }, [isHeadwayLoaded]);

    return isHeadwayLoaded;
};

export default useHeadway;
