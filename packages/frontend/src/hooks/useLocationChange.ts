import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';

const useLocationChange = (callback: () => void) => {
    const { listen } = useHistory();
    useEffect(() => listen(callback), [callback, listen]);
};

export default useLocationChange;
