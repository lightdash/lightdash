import { useContext } from 'react';
import { CustomVisualizationContext } from '.';

export const useCustomVisualizationContext = () =>
    useContext(CustomVisualizationContext);
