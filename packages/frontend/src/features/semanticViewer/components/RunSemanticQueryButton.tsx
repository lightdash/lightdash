import {
    Button,
    Group,
    Kbd,
    MantineProvider,
    Text,
    Tooltip,
    type ButtonGroupProps,
} from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import LimitButton from '../../../components/LimitButton';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectAllSelectedFieldNames } from '../store/selectors';
import { setLimit } from '../store/semanticViewerSlice';

type Props = ButtonGroupProps & {
    onClick: () => void;
    isLoading?: boolean;
    maxQueryLimit: number;
};

export const RunSemanticQueryButton: FC<Props> = ({
    onClick,
    isLoading,
    maxQueryLimit,
    ...buttonGroupProps
}) => {
    const os = useOs();
    const dispatch = useAppDispatch();

    const allSelectedFields = useAppSelector(selectAllSelectedFieldNames);
    const { limit } = useAppSelector((state) => state.semanticViewer);

    const handleLimitChange = useCallback(
        (newLimit: number) => dispatch(setLimit(newLimit)),
        [dispatch],
    );

    return (
        <Button.Group {...buttonGroupProps}>
            <Tooltip
                label={
                    <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
                        <Group spacing="xxs">
                            <Kbd fw={600}>
                                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                            </Kbd>

                            <Text fw={600}>+</Text>

                            <Kbd fw={600}>Enter</Kbd>
                        </Group>
                    </MantineProvider>
                }
                position="bottom"
                withArrow
                withinPortal
                disabled={isLoading}
            >
                <Button
                    size="xs"
                    pr={limit ? 'xs' : undefined}
                    leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={onClick}
                    loading={isLoading}
                    disabled={allSelectedFields.length === 0}
                    sx={(theme) => ({
                        flex: 1,
                        borderRight: `1px solid ${theme.fn.rgba(
                            theme.colors.gray[5],
                            0.6,
                        )}`,
                    })}
                >
                    Run query ({limit ?? maxQueryLimit})
                </Button>
            </Tooltip>

            {handleLimitChange !== undefined && (
                <LimitButton
                    disabled={allSelectedFields.length === 0}
                    size="xs"
                    maxLimit={maxQueryLimit}
                    limit={limit ?? maxQueryLimit}
                    onLimitChange={handleLimitChange}
                />
            )}
        </Button.Group>
    );
};
