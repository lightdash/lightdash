import { createContext } from 'react';

type SetHeaderPopoverOpen = (id: string, open: boolean) => void;

export const TileHeaderPopoverContext = createContext<SetHeaderPopoverOpen>(
    () => {},
);
