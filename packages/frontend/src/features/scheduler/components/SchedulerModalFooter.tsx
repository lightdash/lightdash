import { Box, Button, Group } from '@mantine/core';
import { IconChevronLeft, IconSend } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

interface FooterProps {
    confirmText?: string;
    onBack?: () => void;
    onSendNow?: () => void;
    canSendNow?: boolean;
    onCancel?: () => void;
    onConfirm?: () => void;
    loading?: boolean;
}

const SchedulersModalFooter = ({
    confirmText,
    onBack,
    onCancel,
    onSendNow,
    canSendNow,
    onConfirm,
    loading,
}: FooterProps) => {
    return (
        <Group
            position="apart"
            sx={(theme) => ({
                position: 'sticky',
                backgroundColor: 'white',
                borderTop: `1px solid ${theme.colors.gray[4]}`,
                bottom: 0,
                zIndex: 2,
                padding: theme.spacing.md,
            })}
        >
            {!!onBack ? (
                <Button
                    onClick={onBack}
                    variant="subtle"
                    leftIcon={<MantineIcon icon={IconChevronLeft} />}
                >
                    Back
                </Button>
            ) : (
                <Box />
            )}
            <Group>
                {!!onCancel && (
                    <Button onClick={onCancel} variant="outline">
                        Cancel
                    </Button>
                )}
                {!!onSendNow && (
                    <Button
                        variant="light"
                        leftIcon={<MantineIcon icon={IconSend} />}
                        onClick={onSendNow}
                        disabled={loading || !canSendNow}
                    >
                        Send now
                    </Button>
                )}
                {!!confirmText && (
                    <Button type="submit" loading={loading} onClick={onConfirm}>
                        {confirmText}
                    </Button>
                )}
            </Group>
        </Group>
    );
};

export default SchedulersModalFooter;
