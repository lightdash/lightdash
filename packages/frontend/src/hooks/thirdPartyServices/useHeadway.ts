import { useEffect, useState } from 'react';

const useHeadway = () => {
    const [isHeadwayLoaded, setIsHeadwayLoaded] = useState(false);

    useEffect(() => {
        if (!isHeadwayLoaded) {
            const script = document.createElement('script');
            script.async = false;
            script.src = 'https://cdn.headwayapp.co/widget.js';
            document.head.appendChild(script);
            setIsHeadwayLoaded(true);
        }
    }, [isHeadwayLoaded]);
};

export default useHeadway;
