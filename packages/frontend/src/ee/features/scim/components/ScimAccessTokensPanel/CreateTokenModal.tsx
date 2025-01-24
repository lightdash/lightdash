import { formatTimestamp } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    CopyButton,
    Modal,
    Select,
    Stack,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
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
        <Modal
            size="lg"
            opened
            onClose={() => {
                onBackClick();
            }}
            title={
                <Title order={4}>
                    {data ? 'Your token has been generated' : 'New token'}
                </Title>
            }
        >
            {!isSuccess ? (
                <form onSubmit={handleOnSubmit}>
                    <Stack spacing="md">
                        <TextInput
                            label="What’s this token for?"
                            disabled={isLoading}
                            placeholder="Description"
                            required
                            {...form.getInputProps('description')}
                        />

                        <Select
                            withinPortal
                            defaultValue={expireOptions[0].value}
                            label="Expiration"
                            data={expireOptions}
                            required
                            disabled={isLoading}
                            {...form.getInputProps('expiresAt')}
                        ></Select>

                        <Button type="submit" ml="auto" loading={isLoading}>
                            Generate token
                        </Button>
                    </Stack>
                </form>
            ) : (
                <Stack spacing="md">
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
                    <Alert icon={<MantineIcon icon={IconAlertCircle} />}>
                        {data.expiresAt &&
                            `This token will expire on
                        ${formatTimestamp(data.expiresAt)} `}
                        Make sure to copy your access token now. You won’t be
                        able to see it again!
                    </Alert>
                </Stack>
            )}
        </Modal>
    );
};
