import { ModalProps } from '@mantine/core';
import { FC } from 'react';
import { SyncWithGoogleSheetsModalProvider } from '../../hooks/use-sync-with-google-sheets-modal-provider';
import { SyncModal } from './sync-modal';

type Props = {
    chartUuid: string;
} & Pick<ModalProps, 'opened' | 'onClose'>;

export const SyncWithGoogleSheets: FC<Props> = ({
    chartUuid,
    opened,
    onClose,
}) => (
    <SyncWithGoogleSheetsModalProvider>
        <SyncModal chartUuid={chartUuid} opened={opened} onClose={onClose} />
    </SyncWithGoogleSheetsModalProvider>
);
