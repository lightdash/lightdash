import {Popover2} from "@blueprintjs/popover2";
import {Button, Colors} from "@blueprintjs/core";
import React, {useState} from "react";
import {useTable} from "../hooks/useTable";
import EChartsReact from "echarts-for-react";
import {friendlyName} from "common";

const Content = () => {
    const currentTable = useTable()
    if (currentTable.status !== 'success')
        return null
    const table = currentTable.data.tables[currentTable.data.baseTable]
    const commonNodeProps = {
        symbol: 'circle',
        symbolSize: 20,
    }
    const height = table.dependentTables.length + table.sourceTables.length
    const sourceNodes = table.sourceTables.map((name, idx) => ({
        ...commonNodeProps,
        name: friendlyName(name),
        x: 50 * idx,
        y: 100 * idx,
        itemStyle: {
            color: Colors.BLUE3,
        }
    }))
    const middleNode = {
        ...commonNodeProps,
        name: friendlyName(table.name),
        x: 0,
        y: 100 * table.sourceTables.length,
        itemStyle: {
            color: Colors.BLUE3,
        },
        label: {
            fontWeight: 'bold',
        }
    }
    const dependentNodes = table.dependentTables.map((name, idx) => ({
        ...commonNodeProps,
        name: friendlyName(name),
        x: 50 * idx,
        y: 100 * (height - idx),
        itemStyle: {
            color: Colors.ORANGE3,
        }
    }))
    const nodes = [...sourceNodes, middleNode, ...dependentNodes]
    const edges = [
        ...table.sourceTables.map(source => ({
            source: friendlyName(source),
            target: friendlyName(table.name),
            lineStyle: {
                color: Colors.BLUE3,
            },
        })),
        ...table.dependentTables.map(target => ({
            source: friendlyName(table.name),
            target: friendlyName(target),
            lineStyle: {
                color: Colors.ORANGE3,
            },
        })),
    ]
    const options = {
        animationDurationUpdate: 1500,
        animationEasingUpdate: 'quinticInOut',
        grid: {
            left: 0,
            right: 0
        },
        series: [{
            type: 'graph',
            data: nodes,
            links: edges,
            lineStyle: {
                width: 1.5,
                curveness: 0.1,
                color: Colors.DARK_GRAY5,
                cap: 'round',
                opacity: 1,
            },
            label: {
                show: true,
                position: 'right',
            },
            edgeSymbol: ['circle', 'arrow'],
            edgeSymbolSize: [0, 10],
            center: [50, height * 100 / 2],
            zoom: 1.0,
            cursor: 'default',
            silent: true,
        }],
    }
    return (
        <div style={{width: 300, padding: 5}}>
            <EChartsReact
                option={options}
            />
        </div>
    )
    return (
        <span>Hello</span>
    )
}
export const ShowDagButton = () => {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <Popover2
            content={<Content />}
            interactionKind={'click'}
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position={'right'}
            lazy={true}
            fill={true}
        >
            <Button minimal={true} icon={'data-lineage'} text='Lineage' />
        </Popover2>
    )
}