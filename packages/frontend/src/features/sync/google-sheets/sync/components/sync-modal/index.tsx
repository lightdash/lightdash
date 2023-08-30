import { FC } from 'react';
import { SyncWithGoogleSheetsModalProvider } from '../../hooks/use-sync-with-google-sheets-modal-provider';
import { SyncModal } from './sync-modal';

export const SyncWithGoogleSheets: FC<{ chartUuid: string }> = ({
    chartUuid,
}) => (
    <SyncWithGoogleSheetsModalProvider>
        <SyncModal chartUuid={chartUuid} />
    </SyncWithGoogleSheetsModalProvider>
);
