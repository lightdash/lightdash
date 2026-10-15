import {
    WarehouseTypes,
    type ApiAwsWebIdentityAudienceResponse,
    type ApiError,
    type CreateAwsWebIdentityAudience,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Code,
    Collapse,
    Group,
    Input,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconChevronDown,
    IconChevronUp,
} from '@tabler/icons-react';
import { type UseMutationResult } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { useFormContext } from '../formContext';
import { useAwsWebIdentity } from './awsWebIdentityHooks';

const SUBJECT_PLACEHOLDER = '<SUBJECT>';

const buildTrustPolicy = (subject: string, audience: string) =>
    JSON.stringify(
        {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { Federated: 'accounts.google.com' },
                    Action: 'sts:AssumeRoleWithWebIdentity',
                    Condition: {
                        StringEquals: {
                            'accounts.google.com:sub': subject,
                            'accounts.google.com:aud': subject,
                            'accounts.google.com:oaud': audience,
                        },
                    },
                },
            ],
        },
        null,
        2,
    );

const AthenaWebIdentityFields: FC<{
    disabled: boolean;
    // The audience saved on the connection, if any.
    savedAudience: string | undefined;
    createAudience: UseMutationResult<
        ApiAwsWebIdentityAudienceResponse['results'],
        ApiError,
        CreateAwsWebIdentityAudience
    >;
    onGenerateAudience: () => void;
}> = ({ disabled, savedAudience, createAudience, onGenerateAudience }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    const { warehouse } = form.values;
    const audience =
        warehouse?.type === WarehouseTypes.ATHENA
            ? warehouse.webIdentityAudience
            : '';
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isPolicyOpen, setIsPolicyOpen] = useState(false);

    const identity = useAwsWebIdentity(!disabled);
    const isGenerating = createAudience.isLoading;

    const subject =
        createAudience.data?.subject ?? identity.data?.subject ?? null;
    const isSubjectUnavailable = !subject && !identity.isLoading;
    const trustPolicy = buildTrustPolicy(
        subject ?? SUBJECT_PLACEHOLDER,
        audience || '<audience>',
    );

    const onGenerateClick = () => {
        // A saved connection keeps working only while the role trusts its
        // audience, so confirm before replacing it.
        if (savedAudience && audience === savedAudience) {
            setIsConfirmOpen(true);
        } else {
            onGenerateAudience();
        }
    };

    return (
        <>
            {isSubjectUnavailable && (
                <Alert
                    color="orange"
                    icon={<MantineIcon icon={IconAlertTriangle} />}
                >
                    Web identity isn&apos;t available on this Lightdash
                    instance, because it couldn&apos;t read its own identity.
                    Choose another authentication type, or contact support.
                </Alert>
            )}
            <TextInput
                label={t('warehouseFields.subject')}
                description={t('warehouseFields.subjectDescription')}
                value={subject ?? ''}
                placeholder={
                    identity.isLoading
                        ? t('warehouseFields.loading')
                        : t('warehouseFields.unavailable')
                }
                readOnly
                rightSection={
                    subject ? (
                        <CopyActionIcon
                            value={subject}
                            copyLabel={t('warehouseFields.copySubject')}
                        />
                    ) : null
                }
            />
            <Stack gap={4}>
                <TextInput
                    label={t('warehouseFields.audience')}
                    description={t('warehouseFields.audienceDescription')}
                    value={audience ?? ''}
                    placeholder={
                        isGenerating
                            ? t('warehouseFields.generating')
                            : createAudience.isError
                              ? t('warehouseFields.audienceGenerateFailed')
                              : undefined
                    }
                    readOnly
                    aria-busy={isGenerating}
                    error={
                        form.getInputProps('warehouse.webIdentityAudience')
                            .error
                    }
                    rightSection={
                        audience ? (
                            <CopyActionIcon
                                value={audience}
                                copyLabel={t('warehouseFields.copyAudience')}
                            />
                        ) : null
                    }
                />
                <Group justify="flex-end">
                    <Button
                        size="xs"
                        variant="subtle"
                        loading={isGenerating}
                        disabled={disabled}
                        onClick={onGenerateClick}
                    >
                        {t('warehouseFields.generateNewAudience')}
                    </Button>
                </Group>
            </Stack>
            <Input.Wrapper
                label={t('warehouseFields.trustPolicy')}
                description={t('warehouseFields.trustPolicyDescription')}
            >
                <Group gap="xs" mt={4}>
                    <Button
                        variant="subtle"
                        size="compact-sm"
                        leftSection={
                            <MantineIcon
                                icon={
                                    isPolicyOpen
                                        ? IconChevronUp
                                        : IconChevronDown
                                }
                            />
                        }
                        onClick={() => setIsPolicyOpen((open) => !open)}
                        aria-expanded={isPolicyOpen}
                    >
                        {isPolicyOpen
                            ? t('warehouseFields.hideTrustPolicy')
                            : t('warehouseFields.showTrustPolicy')}
                    </Button>
                    <CopyActionIcon
                        value={trustPolicy}
                        copyLabel={t('warehouseFields.copyTrustPolicy')}
                    />
                </Group>
                <Collapse expanded={isPolicyOpen}>
                    <Code block mt={4}>
                        {trustPolicy}
                    </Code>
                </Collapse>
            </Input.Wrapper>
            <TextInput
                name="warehouse.assumeRoleArn"
                label={t('warehouseFields.iamRoleArn')}
                description={t('warehouseFields.webIdentityRoleArnDescription')}
                required
                {...form.getInputProps('warehouse.assumeRoleArn')}
                placeholder="arn:aws:iam::123456789012:role/lightdash-athena"
                disabled={disabled}
            />
            <MantineModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                title={t('warehouseFields.regenerateAudienceTitle')}
                confirmLabel={t('warehouseFields.generate')}
                onConfirm={() => {
                    setIsConfirmOpen(false);
                    onGenerateAudience();
                }}
            >
                <Text fz="sm">
                    {t('warehouseFields.audienceRegenerateWarning')}
                </Text>
            </MantineModal>
        </>
    );
};

export default AthenaWebIdentityFields;
