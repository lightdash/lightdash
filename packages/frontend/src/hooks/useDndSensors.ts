import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

export const useDndSensors = () => {
    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: { distance: 10 },
    });
    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: { delay: 250, tolerance: 5 },
    });
    return useSensors(mouseSensor, touchSensor);
};
