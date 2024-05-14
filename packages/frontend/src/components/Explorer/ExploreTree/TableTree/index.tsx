import {
    type AdditionalMetric,
    type CompiledTable,
    type CustomDimension,
} from '@lightdash/common';
import { MantineProvider, NavLink, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import type { FC } from 'react';
import { useToggle } from 'react-use';

import { getMantineThemeOverride } from '../../../../mantineTheme';
import { TrackSection } from '../../../../providers/TrackingProvider';
import { SectionName } from '../../../../types/Events';
import MantineIcon from '../../../common/MantineIcon';
import { TableItemDetailPreview } from './ItemDetailPreview';
import TableTreeSections from './TableTreeSections';

type TableTreeWrapperProps = {
    isOpen: boolean;
    toggle: () => void;
    table: CompiledTable;
};

const TableTreeWrapper: FC<React.PropsWithChildren<TableTreeWrapperProps>> = ({
    isOpen,
    toggle,
    table,
    children,
}) => {
    const [isHover, toggleHover] = useToggle(false);

    return (
        <NavLink
            opened={isOpen}
            onChange={toggle}
            onMouseEnter={() => toggleHover(true)}
            onMouseLeave={() => toggleHover(false)}
            icon={<MantineIcon icon={IconTable} size="lg" color="gray.7" />}
            label={
                <TableItemDetailPreview
                    label={table.label}
                    description={table.description}
                    showPreview={isHover}
                    closePreview={() => toggleHover(false)}
                >
                    <Text truncate fw={600}>
                        {table.label}
                    </Text>
                </TableItemDetailPreview>
            }
            styles={{
                root: {
                    top: 0,
                    position: 'sticky',
                    backgroundColor: 'white',
                },
            }}
        >
            {children}
        </NavLink>
    );
};

type Props = {
    isOpenByDefault: boolean;
    searchQuery?: string;
    showTableLabel: boolean;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
    missingCustomMetrics: AdditionalMetric[];
    customDimensions?: CustomDimension[];
    missingCustomDimensions?: CustomDimension[];
    missingFields?: string[];
    selectedDimensions?: string[];
};

const EmptyWrapper: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <>{children}</>
);

const themeOverride = getMantineThemeOverride({
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
});

const TableTree: FC<Props> = ({
    isOpenByDefault,
    showTableLabel,
    table,
    additionalMetrics,
    customDimensions,
    missingCustomMetrics,
    missingCustomDimensions,
    searchQuery,
    missingFields,
    selectedDimensions,
    ...rest
}) => {
    const Wrapper = showTableLabel ? TableTreeWrapper : EmptyWrapper;
    const [isOpen, toggle] = useToggle(isOpenByDefault);
    const isSearching = !!searchQuery && searchQuery !== '';
    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <MantineProvider inherit theme={themeOverride}>
                <Wrapper
                    isOpen={isSearching || isOpen}
                    toggle={toggle}
                    table={table}
                >
                    <TableTreeSections
                        table={table}
                        searchQuery={searchQuery}
                        additionalMetrics={additionalMetrics}
                        customDimensions={customDimensions}
                        missingCustomMetrics={missingCustomMetrics}
                        missingCustomDimensions={missingCustomDimensions}
                        missingFields={missingFields}
                        selectedDimensions={selectedDimensions}
                        {...rest}
                    />
                </Wrapper>
            </MantineProvider>
        </TrackSection>
    );
};

export default TableTree;
