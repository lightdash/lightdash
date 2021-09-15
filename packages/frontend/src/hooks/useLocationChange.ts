import { useHistory } from 'react-router-dom';
import { useEffect } from 'react';

const useLocationChange = (callback: () => void) => {
    const { listen } = useHistory();
    useEffect(() => listen(callback), [callback, listen]);
};

export default useLocationChange;
