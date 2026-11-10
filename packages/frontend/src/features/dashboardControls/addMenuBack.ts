import { createContext, useContext } from 'react';

// The bar's "Add" gives a new filter's field search a way back to its
// Filter or Parameter choice; null anywhere else (a section's +, viewers)
export const AddMenuBackContext = createContext<(() => void) | null>(null);

export const useAddMenuBack = () => useContext(AddMenuBackContext);
