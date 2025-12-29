import { formatTimestamp } from '@lightdash/common';
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
import { IconCheck, IconCopy, IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../../../components/common/Callout';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useCreateScimToken } from '../../hooks/useScimAccessToken';

export const CreateTokenModal: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
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
        {
            label: 'No expiration',
            value: '',
        },
        {
            label: '7 days',
            value: '7',
        },
        {
            label: '30 days',
            value: '30',
        },
        {
            label: '60 days',
            value: '60',
        },
        {
            label: '90 days',
            value: '90',
        },
        {
            label: '6 months',
            value: '180',
        },
        {
            label: '1 year',
            value: '365',
        },
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
            title={isSuccess ? 'Your token has been generated' : 'New token'}
            icon={IconKey}
            size="lg"
            cancelLabel={isSuccess ? false : 'Cancel'}
            cancelDisabled={isLoading}
            actions={
                !isSuccess ? (
                    <Button
                        type="submit"
                        form="create-scim-token-form"
                        loading={isLoading}
                    >
                        Generate token
                    </Button>
                ) : (
                    <Button onClick={onBackClick}>Done</Button>
                )
            }
        >
            {!isSuccess ? (
                <form id="create-scim-token-form" onSubmit={handleOnSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label="What's this token for?"
                            disabled={isLoading}
                            placeholder="Description"
                            required
                            {...form.getInputProps('description')}
                        />

                        <Select
                            defaultValue={expireOptions[0].value}
                            label="Expiration"
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
                        label="Token"
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={data.token}
                        rightSection={
                            <CopyButton value={data.token}>
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
                                                icon={
                                                    copied
                                                        ? IconCheck
                                                        : IconCopy
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        }
                    />
                    <Callout
                        variant="info"
                        title="Make sure to copy your access token now. You won't be able to see it again!"
                    >
                        {data.expiresAt &&
                            `This token will expire on ${formatTimestamp(
                                data.expiresAt,
                            )} `}
                    </Callout>
                </Stack>
            )}
        </MantineModal>
    );
};
