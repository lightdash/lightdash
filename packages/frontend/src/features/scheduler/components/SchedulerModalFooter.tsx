import { Box, Button, Group, Tooltip } from '@mantine-8/core';
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

const SchedulerModalFooter = ({
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
            justify="space-between"
            style={{
                position: 'sticky',
                backgroundColor: 'var(--mantine-color-body)',
                borderTop: '1px solid var(--mantine-color-ldGray-4)',
                bottom: 0,
                zIndex: 2,
                padding: 'var(--mantine-spacing-md)',
            }}
        >
            {onBack ? (
                <Button
                    onClick={onBack}
                    variant="subtle"
                    leftSection={<MantineIcon icon={IconChevronLeft} />}
                >
                    Back
                </Button>
            ) : (
                <Box />
            )}
            <Group>
                {onCancel && (
                    <Button onClick={onCancel} variant="outline">
                        Cancel
                    </Button>
                )}
                {onSendNow && (
                    <Button
                        variant="light"
                        leftSection={<MantineIcon icon={IconSend} />}
                        onClick={onSendNow}
                        disabled={loading || !canSendNow}
                    >
                        Send now
                    </Button>
                )}
                {confirmText && (
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

export default SchedulerModalFooter;
