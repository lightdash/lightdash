import { interpolateUiString } from '@lightdash/common';
import {
    ActionIcon,
    CloseButton,
    Group,
    Popover,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconArrowsMaximize } from '@tabler/icons-react';
import MarkdownPreview, {
    type MarkdownPreviewProps,
} from '@uiw/react-markdown-preview';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useIsLineClamped } from '../../../hooks/useIsLineClamped';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { setDescriptionPopoverIsClosing } from '../store/metricsCatalogSlice';
import classes from './MetricsCatalogColumnDescription.module.css';

type Props = {
    description: string | undefined;
    metricLabel: string;
};

export const MetricsCatalogColumnDescription: FC<Props> = ({
    description,
    metricLabel,
}) => {
    const theme = useMantineTheme();
    const getUiString = useUiStrings();
    const dispatch = useAppDispatch();
    const { ref: highlightRef, isLineClamped } =
        useIsLineClamped<HTMLDivElement>(2);
    const [isOpen, setIsOpen] = useState(false);
    const canOpen = isLineClamped && Boolean(description);

    const isCategoryPopoverClosing = useAppSelector(
        (state) => state.metricsCatalog.popovers.category.isClosing,
    );
    const isDescriptionPopoverClosing = useAppSelector(
        (state) => state.metricsCatalog.popovers.description.isClosing,
    );

    const markdownPreviewProps: MarkdownPreviewProps = {
        style: {
            fontSize: theme.fontSizes.sm,
            color: theme.colors.ldGray[6],
            backgroundColor: 'inherit',
        },
        components: {
            h1: ({ children }) => (
                <h1 style={{ fontWeight: 600 }}>{children}</h1>
            ),
            h2: ({ children }) => (
                <h2 style={{ fontWeight: 600 }}>{children}</h2>
            ),
            h3: ({ children }) => (
                <h3 style={{ fontWeight: 600 }}>{children}</h3>
            ),
            p: ({ children }) => <p style={{ fontWeight: 400 }}>{children}</p>,
            li: ({ children }) => (
                <li style={{ fontWeight: 400 }}>{children}</li>
            ),
        },
    };

    return (
        <Group wrap="nowrap" gap="xs" align="flex-start">
            <Text
                component="div"
                ref={highlightRef}
                c={description ? 'ldGray.6' : 'ldGray.4'}
                fz="sm"
                fw={400}
                lh="150%"
                lineClamp={2}
                className={classes.preview}
            >
                <MarkdownPreview
                    source={description ?? '\\-'}
                    {...markdownPreviewProps}
                />
            </Text>

            <Popover
                opened={isOpen}
                onDismiss={() => {
                    dispatch(setDescriptionPopoverIsClosing(true));
                    setIsOpen(false);
                    setTimeout(
                        () => dispatch(setDescriptionPopoverIsClosing(false)),
                        100,
                    );
                }}
                position="bottom-end"
                width="min(480px, calc(100vw - 24px))"
                floatingStrategy="fixed"
                middlewares={{ shift: { crossAxis: true, padding: 12 } }}
                trapFocus
                returnFocus
                shadow="md"
            >
                <Popover.Target>
                    <ActionIcon
                        aria-label={interpolateUiString(
                            getUiString('metrics.readDescription'),
                            { metric: metricLabel },
                        )}
                        className={classes.expandButton}
                        display={canOpen || isOpen ? undefined : 'none'}
                        variant="subtle"
                        color="gray"
                        onClick={() => {
                            if (
                                !isCategoryPopoverClosing &&
                                !isDescriptionPopoverClosing
                            )
                                setIsOpen((open) => !open);
                        }}
                    >
                        <MantineIcon icon={IconArrowsMaximize} />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown className={classes.dropdown}>
                    <Group
                        justify="space-between"
                        wrap="nowrap"
                        className={classes.header}
                    >
                        <Text fw={600} size="sm">
                            {metricLabel}
                        </Text>
                        <CloseButton
                            size={44}
                            aria-label={getUiString('metrics.closeDescription')}
                            onClick={() => setIsOpen(false)}
                        />
                    </Group>
                    <MarkdownPreview
                        {...markdownPreviewProps}
                        source={description ?? ''}
                    />
                </Popover.Dropdown>
            </Popover>
        </Group>
    );
};
