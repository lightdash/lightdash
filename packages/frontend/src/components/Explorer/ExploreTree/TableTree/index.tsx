import { AdditionalMetric, CompiledTable } from '@lightdash/common';
import {
    Badge,
    Group,
    MantineProvider,
    MantineThemeOverride,
    NavLink,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { FC, useMemo } from 'react';
import { useToggle } from 'react-use';

import { TrackSection } from '../../../../providers/TrackingProvider';
import { SectionName } from '../../../../types/Events';
import MantineIcon from '../../../common/MantineIcon';
import TableTreeSections from './TableTreeSections';

type TableTreeWrapperProps = {
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
};

const TableTreeWrapper: FC<TableTreeWrapperProps> = ({
    table,
    additionalMetrics,
    children,
}) => {
    const [isOpen, toggle] = useToggle(true);

    const tableItemsCount = useMemo(() => {
        return (
            Object.values(table.dimensions).filter((i) => !i.hidden).length +
            Object.values(table.metrics).filter((i) => !i.hidden).length +
            additionalMetrics.length
        );
    }, [table, additionalMetrics]);

    return (
        <NavLink
            opened={isOpen}
            onChange={toggle}
            icon={<MantineIcon icon={IconTable} size="lg" color="gray.7" />}
            label={
                <Tooltip
                    withArrow
                    label={<Text truncate>{table.description}</Text>}
                    position="top-start"
                    maw={350}
                >
                    <Group>
                        <Text truncate fw={600}>
                            {table.label}
                        </Text>

                        {!isOpen && <Badge>{tableItemsCount}</Badge>}
                    </Group>
                </Tooltip>
            }
        >
            {children}
        </NavLink>
    );
};

type Props = {
    searchQuery?: string;
    showTableLabel: boolean;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
};

const EmptyWrapper: FC = ({ children }) => <>{children}</>;

const themeOverride: MantineThemeOverride = {
    components: {
        NavLink: {
            styles: (theme, _params) => ({
                root: {
                    height: theme.spacing.xxl,
                    padding: `0 ${theme.spacing.sm}`,
                    flexGrow: 0,
                },
                rightSection: {
                    marginLeft: theme.spacing.xxs,
                },
            }),
        },
    },
};

const TableTree: FC<Props> = ({
    showTableLabel,
    table,
    additionalMetrics,
    ...rest
}) => {
    const Wrapper = showTableLabel ? TableTreeWrapper : EmptyWrapper;

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <MantineProvider inherit theme={themeOverride}>
                <Wrapper table={table} additionalMetrics={additionalMetrics}>
                    <TableTreeSections
                        table={table}
                        additionalMetrics={additionalMetrics}
                        {...rest}
                    />
                </Wrapper>
            </MantineProvider>
        </TrackSection>
    );
};

export default TableTree;
