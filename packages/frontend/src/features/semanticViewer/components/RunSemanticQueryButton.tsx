import {
    Badge,
    Button,
    Group,
    Kbd,
    MantineProvider,
    Text,
    Tooltip,
    type GroupProps,
} from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconAlertCircle, IconPlayerPlay } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import LimitButton from '../../../components/LimitButton';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { selectAllSelectedFieldNames, selectLimit } from '../store/selectors';
import { setLimit } from '../store/semanticViewerSlice';

type Props = GroupProps & {
    onClick: () => void;
    isLoading?: boolean;
    maxQueryLimit: number;
};

export const RunSemanticQueryButton: FC<Props> = ({
    onClick,
    isLoading,
    maxQueryLimit,
    ...groupProps
}) => {
    const os = useOs();
    const dispatch = useAppDispatch();

    const allSelectedFields = useAppSelector(selectAllSelectedFieldNames);
    const limit = useAppSelector(selectLimit);
    const { results } = useAppSelector((state) => state.semanticViewer);

    const handleLimitChange = useCallback(
        (newLimit: number) => dispatch(setLimit(newLimit)),
        [dispatch],
    );

    const currentLimit = useMemo(() => {
        return limit ?? maxQueryLimit;
    }, [limit, maxQueryLimit]);

    const showLimitWarning = useMemo(() => {
        return results.length >= currentLimit;
    }, [results, currentLimit]);

    return (
        <Group {...groupProps}>
            {showLimitWarning && (
                <Tooltip
                    width={400}
                    label={`Query limit of ${limit} reached. There may be additional results that have not been displayed. To see more, increase the query limit or try narrowing filters.`}
                    multiline
                    position={'bottom'}
                >
                    <Badge
                        leftSection={
                            <MantineIcon icon={IconAlertCircle} size={'sm'} />
                        }
                        color="yellow"
                        variant="outline"
                        tt="none"
                        sx={{ cursor: 'help' }}
                    >
                        Results may be incomplete
                    </Badge>
                </Tooltip>
            )}
            <Button.Group>
                <Tooltip
                    label={
                        <MantineProvider
                            inherit
                            theme={{ colorScheme: 'dark' }}
                        >
                            <Group spacing="xxs">
                                <Kbd fw={600}>
                                    {os === 'macos' || os === 'ios'
                                        ? '⌘'
                                        : 'ctrl'}
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
                        Run query ({currentLimit})
                    </Button>
                </Tooltip>

                {handleLimitChange !== undefined && (
                    <LimitButton
                        disabled={allSelectedFields.length === 0}
                        size="xs"
                        maxLimit={maxQueryLimit}
                        limit={currentLimit}
                        onLimitChange={handleLimitChange}
                    />
                )}
            </Button.Group>
        </Group>
    );
};
