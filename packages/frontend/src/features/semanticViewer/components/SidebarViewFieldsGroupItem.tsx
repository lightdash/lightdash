import {
    assertUnreachable,
    FieldType as FieldKind,
    SemanticLayerFieldType,
    type SemanticLayerField,
    type SemanticLayerTimeDimension,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    Highlight,
    Menu,
    NavLink,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconClock, IconDots } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { getSelectedField } from '../store/selectors';
import {
    deselectField,
    isSemanticLayerStateTimeDimension,
    selectField,
    updateTimeDimensionGranularity,
} from '../store/semanticViewerSlice';
import FieldIcon from './FieldIcon';
import * as SidebarViewFieldMenu from './SidebarViewFieldMenu';

const getNavbarColorByFieldKind = (kind: SemanticLayerField['kind']) => {
    switch (kind) {
        case FieldKind.DIMENSION:
            return 'blue';
        case FieldKind.METRIC:
            return 'orange';
        default:
            return assertUnreachable(kind, `Unknown field kind ${kind}`);
    }
};

type SidebarViewFieldGroupItemProps = {
    field: SemanticLayerField;
    searchQuery: string;
};

const commonMenuProps = {
    withArrow: true,
    withinPortal: true,
    shadow: 'md',
    position: 'bottom-end',
    arrowOffset: 10,
    offset: -5,
} as const;

const SidebarViewFieldGroupItem: FC<SidebarViewFieldGroupItemProps> = ({
    field,
    searchQuery,
}) => {
    const { ref, hovered } = useHover<HTMLAnchorElement>();
    const [isFiltersMenuOpen, filterMenuActions] = useDisclosure(false);
    const [isDateGranularityMenuOpen, dateGranularityMenuActions] =
        useDisclosure(false);

    const dispatch = useAppDispatch();
    const selectedField = useAppSelector(getSelectedField(field.name));

    const handleSelect = <T extends SemanticLayerField>(f: T) => {
        dispatch(selectField(f));
    };

    const handleDeselect = <T extends SemanticLayerField>(f: T) => {
        dispatch(deselectField(f));
    };

    const handleUpdateTimeDimensionGranularity = (
        f: SemanticLayerTimeDimension,
    ) => {
        dispatch(updateTimeDimensionGranularity(f));
    };

    return (
        <NavLink
            ref={ref}
            label={
                <Highlight fz="xs" highlight={searchQuery.split(' ')} truncate>
                    {field.label}
                </Highlight>
            }
            component="a"
            disabled={!field.visible}
            active={!!selectedField}
            py={0}
            pl="xs"
            pr="xxs"
            h={28}
            color={getNavbarColorByFieldKind(field.kind)}
            sx={(theme) => ({
                backgroundColor: theme.fn.lighten(theme.colors.gray[0], 0.5),
            })}
            icon={<FieldIcon field={field} size="md" />}
            rightSection={
                <>
                    {selectedField &&
                    isSemanticLayerStateTimeDimension(selectedField) &&
                    selectedField.granularity ? (
                        <Badge variant="outline" size="xs" bg="white" mr="xxs">
                            {selectedField.granularity}
                        </Badge>
                    ) : null}

                    {hovered ||
                    isFiltersMenuOpen ||
                    isDateGranularityMenuOpen ? (
                        <Group spacing={0}>
                            {field.type === SemanticLayerFieldType.TIME && (
                                <Menu
                                    {...commonMenuProps}
                                    opened={isDateGranularityMenuOpen}
                                    onOpen={dateGranularityMenuActions.open}
                                    onClose={dateGranularityMenuActions.close}
                                >
                                    <Menu.Target>
                                        <ActionIcon
                                            component="div"
                                            variant="transparent"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconClock}
                                                color="gray"
                                                size="md"
                                            />
                                        </ActionIcon>
                                    </Menu.Target>

                                    <Menu.Dropdown>
                                        <SidebarViewFieldMenu.FieldTimeGranularityItems
                                            availableGranularities={
                                                field.availableGranularities
                                            }
                                            value={
                                                selectedField &&
                                                isSemanticLayerStateTimeDimension(
                                                    selectedField,
                                                )
                                                    ? selectedField.granularity ??
                                                      null
                                                    : null
                                            }
                                            onChange={(granularity) => {
                                                return selectedField
                                                    ? handleUpdateTimeDimensionGranularity(
                                                          {
                                                              ...field,
                                                              ...selectedField,
                                                              granularity,
                                                          },
                                                      )
                                                    : handleSelect({
                                                          ...field,
                                                          granularity,
                                                      });
                                            }}
                                        />
                                    </Menu.Dropdown>
                                </Menu>
                            )}

                            <Menu
                                {...commonMenuProps}
                                opened={isFiltersMenuOpen}
                                onOpen={filterMenuActions.open}
                                onClose={filterMenuActions.close}
                            >
                                <Menu.Target>
                                    <ActionIcon
                                        component="div"
                                        variant="transparent"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                        }}
                                    >
                                        <MantineIcon
                                            icon={IconDots}
                                            color="gray"
                                            size="md"
                                        />
                                    </ActionIcon>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    <SidebarViewFieldMenu.FieldFilterItems
                                        field={field}
                                    />
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                    ) : null}
                </>
            }
            onClick={() =>
                !!selectedField ? handleDeselect(field) : handleSelect(field)
            }
        />
    );
};

export default SidebarViewFieldGroupItem;
