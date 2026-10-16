import { type ApiError } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    version: number;
    onClose: () => void;
    onConfirm: () => void;
    isLoading: boolean;
    error: ApiError | null;
};

/** Confirms a restore; the caller owns the mutation so the builder and the
 *  thread preview can restore through different endpoints. */
export const RestoreAppVersionModal: FC<Props> = ({
    version,
    onClose,
    onConfirm,
    isLoading,
    error,
}) => {
    const { t } = useTranslation('apps');
    return (
        <MantineModal
            opened
            onClose={() => {
                if (isLoading) return;
                onClose();
            }}
            title={t('restore.title', { version })}
            icon={IconRestore}
            confirmLabel={t('restore.confirm')}
            cancelDisabled={isLoading}
            confirmLoading={isLoading}
            onConfirm={onConfirm}
        >
            <Stack gap="sm">
                <Text fz="sm">{t('restore.description', { version })}</Text>
                {error !== null && (
                    <Callout variant="danger">
                        {error.error?.message ?? t('restore.failed')}
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};
