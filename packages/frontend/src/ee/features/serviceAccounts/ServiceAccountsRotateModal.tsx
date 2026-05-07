import { type ServiceAccount } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    CopyButton,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconCopy, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
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
                <Callout variant="success" title="Token rotated successfully!">
                    Your old token is now invalid.
                </Callout>

                <TextInput
                    label="New Token"
                    readOnly
                    className="sentry-block ph-no-capture"
                    value={rotatedData.token}
                    rightSection={
                        <CopyButton value={rotatedData.token}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy'}
                                    withArrow
                                    position="right"
                                >
                                    <ActionIcon
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    }
                />

                <Callout
                    variant="info"
                    title="Make sure to copy your new token now"
                >
                    You won't be able to see it again! Your old token is now
                    invalid.
                </Callout>
            </Stack>
        );
    }

    return (
        <form id={ROTATE_FORM_ID} onSubmit={handleOnSubmit}>
            <Stack gap="md">
                <Callout
                    variant="info"
                    title={`Rotating token for "${serviceAccount.description}"`}
                >
                    This will generate a new token and invalidate the current
                    one. You must specify a new expiration date.
                </Callout>

                <Select
                    label="New Expiration"
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
            title="Rotate token"
            icon={IconRefresh}
            size="md"
            cancelLabel={formState.isSuccess ? false : 'Cancel'}
            cancelDisabled={formState.isLoading}
            actions={
                formState.isSuccess ? (
                    <Button onClick={handleClose}>Done</Button>
                ) : (
                    <Button
                        type="submit"
                        form={ROTATE_FORM_ID}
                        loading={formState.isLoading}
                    >
                        Rotate Token
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
