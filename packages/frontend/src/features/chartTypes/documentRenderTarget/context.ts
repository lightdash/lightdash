import { type DocumentQueryReference } from '@lightdash/common';
import { createContext } from 'react';

/**
 * The saved Document cell a chart is rendered from. Custom chart types then
 * authorize through the Document instead of chart-type authoring access.
 */
export const DocumentRenderTargetContext = createContext<
    DocumentQueryReference | undefined
>(undefined);
