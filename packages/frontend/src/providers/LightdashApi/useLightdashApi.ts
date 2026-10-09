import { useContext } from 'react';
import { LightdashApiContext } from './LightdashApiContext';

export const useLightdashApi = () => useContext(LightdashApiContext);
