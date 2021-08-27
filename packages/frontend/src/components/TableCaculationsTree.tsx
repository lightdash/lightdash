import React, { FC, useCallback, useMemo, useState } from 'react';
import {
    Button,
    Classes,
    Colors,
    Icon,
    Tree,
    Menu,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import Fuse from 'fuse.js';
import { TreeEventHandler } from '@blueprintjs/core/src/components/tree/tree';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { TableCalculation } from 'common';
import { useExplorer } from '../providers/ExplorerProvider';
import {
    CreateTableCalculationModal,
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from './TableCalculationModal';

type TableCalculationsTreeProps = {
    search: string;
    onSelectedNodeChange: (name: string) => void;
    selectedNodes: Set<string>;
};

const TableCalculationsButtons: FC = () => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    return (
        <div style={{ display: 'inline-flex', gap: '10px' }}>
            <Tooltip2 content="Add table calculation">
                <Button
                    minimal
                    icon="small-plus"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(true);
                    }}
                />
            </Tooltip2>
            {isOpen && (
                <CreateTableCalculationModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};

const TableCalculationItemButtons: FC<{
    onUpdate: () => void;
    onDelete: () => void;
}> = ({ onUpdate, onDelete }) => {
    const [isOpen, setIsOpen] = useState<boolean>();
    return (
        <div style={{ display: 'inline-flex', gap: '10px' }}>
            <Popover2
                isOpen={isOpen === undefined ? false : isOpen}
                onInteraction={setIsOpen}
                content={
                    <Menu>
                        <MenuItem
                            icon={<Icon icon="edit" />}
                            text="Edit"
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdate();
                                setIsOpen(false);
                            }}
                        />
                        <MenuItem
                            icon={<Icon icon="delete" />}
                            text="Delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                                setIsOpen(false);
                            }}
                        />
                    </Menu>
                }
                position={PopoverPosition.BOTTOM_LEFT}
                lazy
            >
                <Tooltip2 content="View options">
                    <Button
                        minimal
                        icon="more"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(true);
                        }}
                    />
                </Tooltip2>
            </Popover2>
        </div>
    );
};

const TableCalculationsTree: FC<TableCalculationsTreeProps> = ({
    search,
    selectedNodes,
    onSelectedNodeChange,
}) => {
    const {
        state: { tableCalculations },
    } = useExplorer();
    const [tableCalculationToUpdate, setTableCalculationToUpdate] =
        useState<TableCalculation>();
    const [tableCalculationToDelete, setTableCalculationToDelete] =
        useState<TableCalculation>();

    const filteredTableCalculations: TableCalculation[] = useMemo(() => {
        if (search !== '') {
            return new Fuse(Object.values(tableCalculations), {
                keys: ['name'],
            })
                .search(search)
                .map((res) => res.item);
        }
        return Object.values(tableCalculations);
    }, [tableCalculations, search]);

    const contents: TreeNodeInfo<TableCalculation>[] = [
        {
            id: 'tableCalculations',
            label: (
                <span style={{ color: Colors.GREEN1 }}>
                    <strong>Table calculations</strong>
                </span>
            ),
            icon: (
                <Icon
                    icon="function"
                    color={Colors.GREEN1}
                    className={Classes.TREE_NODE_ICON}
                />
            ),
            isExpanded: true,
            hasCaret: false,
            secondaryLabel: <TableCalculationsButtons />,
            childNodes: filteredTableCalculations
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((tableCalculation) => ({
                    key: tableCalculation.name,
                    id: tableCalculation.name,
                    label: <>{tableCalculation.displayName}</>,
                    nodeData: tableCalculation,
                    isSelected: selectedNodes.has(tableCalculation.name),
                    secondaryLabel: (
                        <TableCalculationItemButtons
                            onUpdate={() =>
                                setTableCalculationToUpdate(tableCalculation)
                            }
                            onDelete={() =>
                                setTableCalculationToDelete(tableCalculation)
                            }
                        />
                    ),
                })),
        },
    ];

    const handleNodeClick: TreeEventHandler<TableCalculation> = useCallback(
        (nodeData: TreeNodeInfo<TableCalculation>, _nodePath: number[]) => {
            if (_nodePath.length !== 1 && nodeData.nodeData) {
                onSelectedNodeChange(nodeData.nodeData.name);
            }
        },
        [onSelectedNodeChange],
    );

    return (
        <>
            <Tree contents={contents} onNodeClick={handleNodeClick} />
            {tableCalculationToUpdate && (
                <UpdateTableCalculationModal
                    isOpen
                    tableCalculation={tableCalculationToUpdate}
                    onClose={() => setTableCalculationToUpdate(undefined)}
                />
            )}
            {tableCalculationToDelete && (
                <DeleteTableCalculationModal
                    isOpen
                    tableCalculation={tableCalculationToDelete}
                    onClose={() => setTableCalculationToDelete(undefined)}
                />
            )}
        </>
    );
};

export default TableCalculationsTree;
