import {
    assertUnreachable,
    FieldType as FieldKind,
    SemanticLayerTimeGranularity,
    type SemanticLayerField,
    type SemanticLayerTimeDimension,
} from '@lightdash/common';
import { ActionIcon, Highlight, Menu, NavLink } from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconDots } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../store/hooks';
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

const SidebarViewFieldGroupItem: FC<SidebarViewFieldGroupItemProps> = ({
    field,
    searchQuery,
}) => {
    const { ref, hovered } = useHover<HTMLAnchorElement>();
    const [isMenuOpen, { open: menuOpen, close: menuClose }] =
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
            h={28}
            color={getNavbarColorByFieldKind(field.kind)}
            sx={(theme) => ({
                backgroundColor: theme.fn.lighten(theme.colors.gray[0], 0.5),
            })}
            icon={<FieldIcon field={field} size="md" />}
            rightSection={
                (selectedField || hovered || isMenuOpen) && (
                    <Menu
                        withArrow
                        withinPortal
                        shadow="md"
                        position="bottom-end"
                        arrowOffset={10}
                        offset={2}
                        opened={isMenuOpen}
                        onOpen={menuOpen}
                        onClose={menuClose}
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
                            <SidebarViewFieldMenu.FieldTimeGranularityItems
                                availableGranularities={
                                    field.availableGranularities
                                }
                                value={
                                    selectedField &&
                                    isSemanticLayerStateTimeDimension(
                                        selectedField,
                                    )
                                        ? selectedField.granularity ?? null
                                        : null
                                }
                                onChange={(granularity) => {
                                    const defaultedGranularity =
                                        granularity ??
                                        field.availableGranularities[0] ??
                                        SemanticLayerTimeGranularity.DAY;

                                    if (selectedField) {
                                        handleUpdateTimeDimensionGranularity({
                                            ...field,
                                            ...selectedField,
                                            granularity: defaultedGranularity,
                                        });
                                    } else {
                                        handleSelect({
                                            ...field,
                                            granularity: defaultedGranularity,
                                        });
                                    }
                                }}
                            />

                            <SidebarViewFieldMenu.FieldFilterItems
                                field={field}
                            />
                        </Menu.Dropdown>
                    </Menu>
                )
            }
            onClick={() =>
                !!selectedField ? handleDeselect(field) : handleSelect(field)
            }
        />
    );
};

export default SidebarViewFieldGroupItem;
