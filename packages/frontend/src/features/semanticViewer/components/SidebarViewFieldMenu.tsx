import type { SemanticLayerField } from '@lightdash/common';
import { ActionIcon, Menu, type MenuProps } from '@mantine/core';
import { IconDots, IconFilter } from '@tabler/icons-react';
import { useCallback, type FC, type PropsWithChildren } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch } from '../store/hooks';
import { addFilterAndOpenModal } from '../store/semanticViewerSlice';

type SidebarViewFieldMenuProps = MenuProps & {
    field: SemanticLayerField;
    isMenuOpen: boolean;
    menuOpen: () => void;
    menuClose: () => void;
};

const SidebarViewFieldMenu: FC<
    PropsWithChildren<SidebarViewFieldMenuProps>
> = ({ field, isMenuOpen, menuOpen, menuClose, children, ...menuProps }) => {
    const dispatch = useAppDispatch();

    const handleAddFilter = useCallback(() => {
        dispatch(
            addFilterAndOpenModal({
                uuid: uuidv4(),
                field: field.name,
                fieldKind: field.kind,
                fieldType: field.type,
                operator: field.availableOperators[0],
                values: [],
            }),
        );
    }, [dispatch, field]);

    return (
        <Menu
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            offset={2}
            onOpen={menuOpen}
            onClose={menuClose}
            opened={isMenuOpen}
            {...menuProps}
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
                    <MantineIcon icon={IconDots} color="gray" size="md" />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                {field.availableOperators.length > 0 && (
                    <>
                        <Menu.Label>Actions</Menu.Label>
                        <Menu.Item
                            icon={<IconFilter size={14} />}
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleAddFilter();
                            }}
                        >
                            Add filter
                        </Menu.Item>
                    </>
                )}

                {children}
            </Menu.Dropdown>
        </Menu>
    );
};

export default SidebarViewFieldMenu;
