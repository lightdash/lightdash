import { WarehouseTypes } from '@lightdash/common';
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
import { useEffect, useState, type FC } from 'react';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { useFormContext } from '../formContext';
import {
    useAwsWebIdentity,
    useCreateAwsWebIdentityAudience,
} from './awsWebIdentityHooks';

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
}> = ({ disabled, savedAudience }) => {
    const form = useFormContext();
    const { warehouse } = form.values;
    const audience =
        warehouse?.type === WarehouseTypes.ATHENA
            ? warehouse.webIdentityAudience
            : '';
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isPolicyOpen, setIsPolicyOpen] = useState(false);

    const identity = useAwsWebIdentity(!disabled);
    const createAudience = useCreateAwsWebIdentityAudience({
        onSuccess: (result) => {
            form.setFieldValue(
                'warehouse.webIdentityAudience',
                result.audience,
            );
        },
    });
    const { mutate: generateAudience, isLoading: isGenerating } =
        createAudience;

    // Generate an audience as soon as this option is chosen, so the trust
    // policy can be written before the connection is saved.
    useEffect(() => {
        if (
            !audience &&
            !disabled &&
            !isGenerating &&
            !createAudience.isError
        ) {
            generateAudience();
        }
    }, [
        audience,
        disabled,
        isGenerating,
        createAudience.isError,
        generateAudience,
    ]);

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
            generateAudience();
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
                label="Subject"
                description="This Lightdash instance's identity. Use it as accounts.google.com:sub and accounts.google.com:aud."
                value={subject ?? ''}
                placeholder={identity.isLoading ? 'Loading…' : 'Unavailable'}
                readOnly
                rightSection={
                    subject ? (
                        <CopyActionIcon
                            value={subject}
                            copyLabel="Copy subject"
                        />
                    ) : null
                }
            />
            <Stack gap={4}>
                <TextInput
                    label="Audience"
                    description="Paste this into the role's trust policy as accounts.google.com:oaud."
                    value={audience ?? ''}
                    placeholder={
                        isGenerating
                            ? 'Generating…'
                            : createAudience.isError
                              ? "Couldn't generate. Select Generate new audience."
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
                                copyLabel="Copy audience"
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
                        Generate new audience
                    </Button>
                </Group>
            </Stack>
            <Input.Wrapper
                label="Trust policy"
                description="Give this to whoever manages IAM in your AWS account. Paste it in the role's trust policy JSON editor. Don't use the Audience box in the IAM console's role wizard."
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
                            ? 'Hide trust policy'
                            : 'Show trust policy'}
                    </Button>
                    <CopyActionIcon
                        value={trustPolicy}
                        copyLabel="Copy trust policy"
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
                label="IAM Role ARN"
                description="The IAM role Lightdash assumes in your AWS account. Update its trust policy before you test the connection."
                required
                {...form.getInputProps('warehouse.assumeRoleArn')}
                placeholder="arn:aws:iam::123456789012:role/lightdash-athena"
                disabled={disabled}
            />
            <MantineModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                title="Generate a new audience?"
                confirmLabel="Generate"
                onConfirm={() => {
                    setIsConfirmOpen(false);
                    generateAudience();
                }}
            >
                <Text fz="sm">
                    This connection stops working when you save, until the
                    role&apos;s trust policy uses the new audience.
                </Text>
            </MantineModal>
        </>
    );
};

export default AthenaWebIdentityFields;
