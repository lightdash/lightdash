import { formatTimestamp } from '@lightdash/common';
import { Button, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../../../components/common/Callout';
import { CopyActionIcon } from '../../../../../components/common/CopyActionIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useCreateScimToken } from '../../hooks/useScimAccessToken';

export const CreateTokenModal: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
    const { t } = useTranslation('serviceAccounts');
    const {
        data,
        mutate: createScimToken,
        isLoading,
        isSuccess,
    } = useCreateScimToken();

    const form = useForm({
        initialValues: {
            description: '',
            expiresAt: '',
        },
    });

    const expireOptions = [
        { label: t('expiration.none'), value: '' },
        { label: t('expiration.days', { count: 7 }), value: '7' },
        { label: t('expiration.days', { count: 30 }), value: '30' },
        { label: t('expiration.days', { count: 60 }), value: '60' },
        { label: t('expiration.days', { count: 90 }), value: '90' },
        { label: t('expiration.months', { count: 6 }), value: '180' },
        { label: t('expiration.years', { count: 1 }), value: '365' },
    ];

    const handleOnSubmit = form.onSubmit(({ description, expiresAt }) => {
        const currentDate = new Date();
        const dateWhenExpires = !!Number(expiresAt)
            ? new Date(
                  currentDate.setDate(
                      currentDate.getDate() + Number(expiresAt),
                  ),
              )
            : undefined;

        createScimToken({
            description,
            expiresAt: dateWhenExpires ?? null,
        });
    });

    return (
        <MantineModal
            opened
            onClose={onBackClick}
            role="alertdialog"
            title={
                isSuccess
                    ? t('scim.createModal.generatedTitle')
                    : t('scim.createModal.title')
            }
            icon={IconKey}
            size="lg"
            cancelLabel={
                isSuccess ? false : t('actions.cancel', { ns: 'common' })
            }
            cancelDisabled={isLoading}
            actions={
                !isSuccess ? (
                    <Button
                        type="submit"
                        form="create-scim-token-form"
                        loading={isLoading}
                    >
                        {t('scim.createModal.generate')}
                    </Button>
                ) : (
                    <Button onClick={onBackClick}>
                        {t('createModal.done')}
                    </Button>
                )
            }
        >
            {!isSuccess ? (
                <form id="create-scim-token-form" onSubmit={handleOnSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label={t('scim.createModal.descriptionLabel')}
                            disabled={isLoading}
                            placeholder={t('form.description')}
                            required
                            {...form.getInputProps('description')}
                        />

                        <Select
                            defaultValue={expireOptions[0].value}
                            label={t('form.expiration')}
                            data={expireOptions}
                            required
                            disabled={isLoading}
                            {...form.getInputProps('expiresAt')}
                        />
                    </Stack>
                </form>
            ) : (
                <Stack gap="md">
                    <TextInput
                        id="invite-link-input"
                        label={t('createModal.token')}
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={data.token}
                        rightSection={
                            <CopyActionIcon
                                value={data.token}
                                tooltipPosition="right"
                            />
                        }
                    />
                    <Callout
                        variant="info"
                        title={t('createModal.copyTokenWarning')}
                    >
                        {data.expiresAt &&
                            t('scim.createModal.expiresOn', {
                                date: formatTimestamp(data.expiresAt),
                            })}
                    </Callout>
                </Stack>
            )}
        </MantineModal>
    );
};
