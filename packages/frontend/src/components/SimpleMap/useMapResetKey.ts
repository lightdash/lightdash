import { useEffect, useState } from 'react';

/**
 * react-leaflet cannot survive React's `<Activity>` hiding its subtree: the
 * cleanup removes the Leaflet map but nothing recreates it when the subtree
 * is shown again. The documented remedy is a new `key` on `MapContainer`,
 * so this bumps one every time the owning effect is torn down.
 *
 * @see https://github.com/PaulLeCam/react-leaflet/issues/1166
 * @see https://react-leaflet.js.org/docs/start-introduction/#limitations
 */
export const useMapResetKey = () => {
    const [resetKey, setResetKey] = useState(0);
    useEffect(() => () => setResetKey((key) => key + 1), []);
    return resetKey;
};
