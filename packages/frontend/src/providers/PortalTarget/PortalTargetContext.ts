import { createContext } from 'react';

/** Selector of the element that owns portalled content. Null means the
 *  document body, which is right for the app; the SDK provides its own
 *  container so portalled content keeps the SDK's scoped styles. */
export const PortalTargetContext = createContext<string | null>(null);
