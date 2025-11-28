import { Box, Button, Group, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconSend } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

interface FooterProps {
    confirmText?: string;
    disableConfirm?: boolean;
    onBack?: () => void;
    onSendNow?: () => void;
    canSendNow?: boolean;
    onCancel?: () => void;
    onConfirm?: () => void;
    loading?: boolean;
    disabledMessage?: string;
}

const SchedulersModalFooter = ({
    confirmText,
    disableConfirm,
    onBack,
    onCancel,
    onSendNow,
    canSendNow,
    onConfirm,
    loading,
    disabledMessage,
}: FooterProps) => {
    return (
        <Group
            position="apart"
            sx={(theme) => ({
                position: 'sticky',
                backgroundColor: theme.colors.background[0],
                borderTop: `1px solid ${theme.colors.ldGray[4]}`,
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
                    <Tooltip
                        label={disabledMessage}
                        disabled={!disableConfirm || !disabledMessage}
                        fz="xs"
                    >
                        <Box>
                            <Button
                                type="submit"
                                disabled={disableConfirm}
                                loading={loading}
                                onClick={onConfirm}
                            >
                                {confirmText}
                            </Button>
                        </Box>
                    </Tooltip>
                )}
            </Group>
        </Group>
    );
};

export default SchedulersModalFooter;
