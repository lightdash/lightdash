import { type DocumentQueryReference } from '@lightdash/common';
import { useContext } from 'react';
import { DocumentRenderTargetContext } from './context';

export const useDocumentRenderTarget = (): DocumentQueryReference | undefined =>
    useContext(DocumentRenderTargetContext);
