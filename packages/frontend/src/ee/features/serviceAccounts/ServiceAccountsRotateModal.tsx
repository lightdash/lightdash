import { type ServiceAccount } from '@lightdash/common';
import { Button, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useExpireOptions } from '../../../components/UserSettings/AccessTokensPanel/useExpireOptions';
import { useServiceAccounts } from './useServiceAccounts';

const ROTATE_FORM_ID = 'rotate-service-account-form';

interface RotateFormState {
    isLoading: boolean;
    isSuccess: boolean;
}

const RotateForm: FC<{
    serviceAccount: ServiceAccount;
    onStateChange: (state: RotateFormState) => void;
}> = ({ serviceAccount, onStateChange }) => {
    const { t } = useTranslation('serviceAccounts');
    const { rotateAccount } = useServiceAccounts();
    const { mutate, isLoading, isSuccess, data: rotatedData } = rotateAccount;

    const onRotate = useCallback(
        (expiresAt: string) => {
            mutate({ uuid: serviceAccount.uuid, expiresAt });
        },
        [serviceAccount.uuid, mutate],
    );

    const expireOptions = useExpireOptions();

    const form = useForm({
        initialValues: {
            expiresAt: expireOptions[0]?.value || '30',
        },
    });

    const handleOnSubmit = form.onSubmit(({ expiresAt }) => {
        const currentDate = new Date();
        const dateWhenExpires = new Date(
            currentDate.setDate(currentDate.getDate() + Number(expiresAt)),
        );
        onRotate(dateWhenExpires.toISOString());
    });

    useEffect(() => {
        onStateChange({ isLoading, isSuccess });
    }, [isLoading, isSuccess, onStateChange]);

    if (isSuccess && rotatedData) {
        return (
            <Stack gap="md">
                <Callout
                    variant="success"
                    title={t('rotateModal.successTitle')}
                >
                    {t('rotateModal.oldTokenInvalid')}
                </Callout>

                <TextInput
                    label={t('rotateModal.newToken')}
                    readOnly
                    className="sentry-block ph-no-capture"
                    value={rotatedData.token}
                    rightSection={
                        <CopyActionIcon
                            value={rotatedData.token}
                            tooltipPosition="right"
                        />
                    }
                />

                <Callout variant="info" title={t('rotateModal.copyNowTitle')}>
                    {t('rotateModal.copyNowBody')}
                </Callout>
            </Stack>
        );
    }

    return (
        <form id={ROTATE_FORM_ID} onSubmit={handleOnSubmit}>
            <Stack gap="md">
                <Callout
                    variant="info"
                    title={t('rotateModal.rotatingFor', {
                        name: serviceAccount.description,
                    })}
                >
                    {t('rotateModal.description')}
                </Callout>

                <Select
                    label={t('rotateModal.newExpiration')}
                    data={expireOptions}
                    required
                    disabled={isLoading}
                    {...form.getInputProps('expiresAt')}
                />
            </Stack>
        </form>
    );
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    serviceAccount: ServiceAccount | undefined;
};

export const ServiceAccountsRotateModal: FC<Props> = ({
    isOpen,
    onClose,
    serviceAccount,
}) => {
    const { t } = useTranslation('serviceAccounts');
    const [formState, setFormState] = useState<RotateFormState>({
        isLoading: false,
        isSuccess: false,
    });

    const handleClose = useCallback(() => {
        onClose();
        setFormState({ isLoading: false, isSuccess: false });
    }, [onClose]);

    return (
        <MantineModal
            opened={isOpen}
            onClose={handleClose}
            role="alertdialog"
            title={t('rotateModal.title')}
            icon={IconRefresh}
            size="md"
            cancelLabel={
                formState.isSuccess
                    ? false
                    : t('actions.cancel', { ns: 'common' })
            }
            cancelDisabled={formState.isLoading}
            actions={
                formState.isSuccess ? (
                    <Button onClick={handleClose}>
                        {t('createModal.done')}
                    </Button>
                ) : (
                    <Button
                        type="submit"
                        form={ROTATE_FORM_ID}
                        loading={formState.isLoading}
                    >
                        {t('rotateModal.rotate')}
                    </Button>
                )
            }
        >
            {serviceAccount ? (
                <RotateForm
                    key={serviceAccount.uuid}
                    serviceAccount={serviceAccount}
                    onStateChange={setFormState}
                />
            ) : null}
        </MantineModal>
    );
};
