import { ALL_WAREHOUSES } from '../config';
import type { TestCase } from '../types';

export const windowCases: TestCase[] = [
    // ── RUNNING_TOTAL ─────────────────────────────────────────────

    {
        id: 'window/running-total',
        formula: '=RUNNING_TOTAL(A, ORDER BY B)',
        description: 'Cumulative sum ordered by id',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: 100.00 },
            { result: 300.00 },
            { result: 450.00 },
            { result: 750.00 },
            { result: 1000.00 },
            { result: 1050.00 },
            { result: 1125.00 },
            { result: 1185.00 },
            { result: 1275.00 },
            { result: 1355.00 },
            { result: 1855.00 },
            { result: 2255.00 },
            { result: 2705.00 },
            { result: 3055.00 },
            { result: 3605.00 },
            { result: 3615.00 },
            { result: 3635.00 },
            { result: 3650.00 },
            { result: 3675.00 },
            { result: 3705.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/running-total-partitioned',
        formula: '=RUNNING_TOTAL(A, PARTITION BY B, ORDER BY C)',
        description: 'Cumulative sum partitioned by category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            // Category A: 100, 300, 450, 750, 1000
            { result: 100.00 },
            { result: 300.00 },
            { result: 450.00 },
            { result: 750.00 },
            { result: 1000.00 },
            // Category B: 50, 125, 185, 275, 355
            { result: 50.00 },
            { result: 125.00 },
            { result: 185.00 },
            { result: 275.00 },
            { result: 355.00 },
            // Category C: 500, 900, 1350, 1700, 2250
            { result: 500.00 },
            { result: 900.00 },
            { result: 1350.00 },
            { result: 1700.00 },
            { result: 2250.00 },
            // Category D: 10, 30, 45, 70, 100
            { result: 10.00 },
            { result: 30.00 },
            { result: 45.00 },
            { result: 70.00 },
            { result: 100.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/running-total-by-amount',
        formula: '=RUNNING_TOTAL(A, ORDER BY A)',
        description: 'Cumulative sum ordered by amount itself (global ranking)',
        columns: { A: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Amounts sorted: 10,15,20,25,30,50,60,75,80,90,100,150,200,250,300,350,400,450,500,550
        // Running:         10,25,45,70,100,150,210,285,365,455,555,705,905,1155,1455,1805,2205,2655,3155,3705
        expectedRows: [
            { result: 555.00 },   // id1: amount=100 → pos 11
            { result: 905.00 },   // id2: amount=200 → pos 13
            { result: 705.00 },   // id3: amount=150 → pos 12
            { result: 1455.00 },  // id4: amount=300 → pos 15
            { result: 1155.00 },  // id5: amount=250 → pos 14
            { result: 150.00 },   // id6: amount=50 → pos 6
            { result: 285.00 },   // id7: amount=75 → pos 8
            { result: 210.00 },   // id8: amount=60 → pos 7
            { result: 455.00 },   // id9: amount=90 → pos 10
            { result: 365.00 },   // id10: amount=80 → pos 9
            { result: 3155.00 },  // id11: amount=500 → pos 19
            { result: 2205.00 },  // id12: amount=400 → pos 17
            { result: 2655.00 },  // id13: amount=450 → pos 18
            { result: 1805.00 },  // id14: amount=350 → pos 16
            { result: 3705.00 },  // id15: amount=550 → pos 20
            { result: 10.00 },    // id16: amount=10 → pos 1
            { result: 45.00 },    // id17: amount=20 → pos 3
            { result: 25.00 },    // id18: amount=15 → pos 2
            { result: 70.00 },    // id19: amount=25 → pos 4
            { result: 100.00 },   // id20: amount=30 → pos 5
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/running-total-partitioned-by-amount',
        formula: '=RUNNING_TOTAL(A, PARTITION BY B, ORDER BY A)',
        description: 'Cumulative sum partitioned by category, ordered by amount',
        columns: { A: 'amount', B: 'category' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A sorted by amount: 100,150,200,250,300 → running: 100,250,450,700,1000
        // B sorted by amount: 50,60,75,80,90 → running: 50,110,185,265,355
        // C sorted by amount: 350,400,450,500,550 → running: 350,750,1200,1700,2250
        // D sorted by amount: 10,15,20,25,30 → running: 10,25,45,70,100
        expectedRows: [
            { result: 100.00 },   // id1: A,100 → 100
            { result: 450.00 },   // id2: A,200 → 450
            { result: 250.00 },   // id3: A,150 → 250
            { result: 1000.00 },  // id4: A,300 → 1000
            { result: 700.00 },   // id5: A,250 → 700
            { result: 50.00 },    // id6: B,50 → 50
            { result: 185.00 },   // id7: B,75 → 185
            { result: 110.00 },   // id8: B,60 → 110
            { result: 355.00 },   // id9: B,90 → 355
            { result: 265.00 },   // id10: B,80 → 265
            { result: 1700.00 },  // id11: C,500 → 1700
            { result: 750.00 },   // id12: C,400 → 750
            { result: 1200.00 },  // id13: C,450 → 1200
            { result: 350.00 },   // id14: C,350 → 350
            { result: 2250.00 },  // id15: C,550 → 2250
            { result: 10.00 },    // id16: D,10 → 10
            { result: 45.00 },    // id17: D,20 → 45
            { result: 25.00 },    // id18: D,15 → 25
            { result: 70.00 },    // id19: D,25 → 70
            { result: 100.00 },   // id20: D,30 → 100
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/running-total-rank-val',
        formula: '=RUNNING_TOTAL(A, ORDER BY B)',
        description: 'Running total of rank_val column ordered by id',
        columns: { A: 'rank_val', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // rank_vals by id: 10,20,15,30,25,5,8,6,9,7,50,40,45,35,55,1,2,3,4,5
        expectedRows: [
            { result: 10 },
            { result: 30 },
            { result: 45 },
            { result: 75 },
            { result: 100 },
            { result: 105 },
            { result: 113 },
            { result: 119 },
            { result: 128 },
            { result: 135 },
            { result: 185 },
            { result: 225 },
            { result: 270 },
            { result: 305 },
            { result: 360 },
            { result: 361 },
            { result: 363 },
            { result: 366 },
            { result: 370 },
            { result: 375 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── ROW_NUMBER ────────────────────────────────────────────────

    {
        id: 'window/row-number',
        formula: '=ROW_NUMBER(ORDER BY A)',
        description: 'Sequential row numbering ordered by id',
        columns: { A: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: 1 },
            { result: 2 },
            { result: 3 },
            { result: 4 },
            { result: 5 },
            { result: 6 },
            { result: 7 },
            { result: 8 },
            { result: 9 },
            { result: 10 },
            { result: 11 },
            { result: 12 },
            { result: 13 },
            { result: 14 },
            { result: 15 },
            { result: 16 },
            { result: 17 },
            { result: 18 },
            { result: 19 },
            { result: 20 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/row-number-partitioned',
        formula: '=ROW_NUMBER(PARTITION BY A, ORDER BY B)',
        description: 'Row numbering within each category partition',
        columns: { A: 'category', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Each category has 5 rows, numbered 1-5 within partition
        expectedRows: [
            { result: 1 }, { result: 2 }, { result: 3 }, { result: 4 }, { result: 5 },
            { result: 1 }, { result: 2 }, { result: 3 }, { result: 4 }, { result: 5 },
            { result: 1 }, { result: 2 }, { result: 3 }, { result: 4 }, { result: 5 },
            { result: 1 }, { result: 2 }, { result: 3 }, { result: 4 }, { result: 5 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/row-number-by-amount',
        formula: '=ROW_NUMBER(ORDER BY A)',
        description: 'Row numbering ordered by amount — ranks all rows globally',
        columns: { A: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // All amounts unique, sorted: 10,15,20,25,30,50,60,75,80,90,100,150,200,250,300,350,400,450,500,550
        expectedRows: [
            { result: 11 },  // id1: 100
            { result: 13 },  // id2: 200
            { result: 12 },  // id3: 150
            { result: 15 },  // id4: 300
            { result: 14 },  // id5: 250
            { result: 6 },   // id6: 50
            { result: 8 },   // id7: 75
            { result: 7 },   // id8: 60
            { result: 10 },  // id9: 90
            { result: 9 },   // id10: 80
            { result: 19 },  // id11: 500
            { result: 17 },  // id12: 400
            { result: 18 },  // id13: 450
            { result: 16 },  // id14: 350
            { result: 20 },  // id15: 550
            { result: 1 },   // id16: 10
            { result: 3 },   // id17: 20
            { result: 2 },   // id18: 15
            { result: 4 },   // id19: 25
            { result: 5 },   // id20: 30
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/row-number-partitioned-by-amount',
        formula: '=ROW_NUMBER(PARTITION BY A, ORDER BY B)',
        description: 'Rank within category by amount',
        columns: { A: 'category', B: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A by amount: 100(1),150(2),200(3),250(4),300(5) → id1→1,id2→3,id3→2,id4→5,id5→4
        // B by amount: 50(1),60(2),75(3),80(4),90(5) → id6→1,id7→3,id8→2,id9→5,id10→4
        // C by amount: 350(1),400(2),450(3),500(4),550(5) → id11→4,id12→2,id13→3,id14→1,id15→5
        // D by amount: 10(1),15(2),20(3),25(4),30(5) → id16→1,id17→3,id18→2,id19→4,id20→5
        expectedRows: [
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 5 }, { result: 4 },
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 5 }, { result: 4 },
            { result: 4 }, { result: 2 }, { result: 3 }, { result: 1 }, { result: 5 },
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 4 }, { result: 5 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── LAG ───────────────────────────────────────────────────────

    {
        id: 'window/lag',
        formula: '=LAG(A, ORDER BY B)',
        description: 'Previous row value ordered by id (global)',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: null },
            { result: 100.00 },
            { result: 200.00 },
            { result: 150.00 },
            { result: 300.00 },
            { result: 250.00 },
            { result: 50.00 },
            { result: 75.00 },
            { result: 60.00 },
            { result: 90.00 },
            { result: 80.00 },
            { result: 500.00 },
            { result: 400.00 },
            { result: 450.00 },
            { result: 350.00 },
            { result: 550.00 },
            { result: 10.00 },
            { result: 20.00 },
            { result: 15.00 },
            { result: 25.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lag-partitioned',
        formula: '=LAG(A, PARTITION BY B, ORDER BY C)',
        description: 'Previous row value within each category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A by id: 100,200,150,300,250 → lag: null,100,200,150,300
        // B by id: 50,75,60,90,80 → lag: null,50,75,60,90
        // C by id: 500,400,450,350,550 → lag: null,500,400,450,350
        // D by id: 10,20,15,25,30 → lag: null,10,20,15,25
        expectedRows: [
            { result: null }, { result: 100.00 }, { result: 200.00 }, { result: 150.00 }, { result: 300.00 },
            { result: null }, { result: 50.00 }, { result: 75.00 }, { result: 60.00 }, { result: 90.00 },
            { result: null }, { result: 500.00 }, { result: 400.00 }, { result: 450.00 }, { result: 350.00 },
            { result: null }, { result: 10.00 }, { result: 20.00 }, { result: 15.00 }, { result: 25.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lag-partitioned-by-amount',
        formula: '=LAG(A, PARTITION BY B, ORDER BY A)',
        description: 'Previous value within category when ordered by amount',
        columns: { A: 'amount', B: 'category' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A sorted by amount: 100,150,200,250,300 → lag: null,100,150,200,250
        //   id1(100)→null, id2(200)→150, id3(150)→100, id4(300)→250, id5(250)→200
        // B sorted by amount: 50,60,75,80,90 → lag: null,50,60,75,80
        //   id6(50)→null, id7(75)→60, id8(60)→50, id9(90)→80, id10(80)→75
        // C sorted by amount: 350,400,450,500,550 → lag: null,350,400,450,500
        //   id11(500)→450, id12(400)→350, id13(450)→400, id14(350)→null, id15(550)→500
        // D sorted by amount: 10,15,20,25,30 → lag: null,10,15,20,25
        //   id16(10)→null, id17(20)→15, id18(15)→10, id19(25)→20, id20(30)→25
        expectedRows: [
            { result: null }, { result: 150.00 }, { result: 100.00 }, { result: 250.00 }, { result: 200.00 },
            { result: null }, { result: 60.00 }, { result: 50.00 }, { result: 80.00 }, { result: 75.00 },
            { result: 450.00 }, { result: 350.00 }, { result: 400.00 }, { result: null }, { result: 500.00 },
            { result: null }, { result: 15.00 }, { result: 10.00 }, { result: 20.00 }, { result: 25.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lag-rank-val',
        formula: '=LAG(A, ORDER BY B)',
        description: 'LAG on rank_val column ordered by id',
        columns: { A: 'rank_val', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // rank_vals by id: 10,20,15,30,25,5,8,6,9,7,50,40,45,35,55,1,2,3,4,5
        expectedRows: [
            { result: null },
            { result: 10 },
            { result: 20 },
            { result: 15 },
            { result: 30 },
            { result: 25 },
            { result: 5 },
            { result: 8 },
            { result: 6 },
            { result: 9 },
            { result: 7 },
            { result: 50 },
            { result: 40 },
            { result: 45 },
            { result: 35 },
            { result: 55 },
            { result: 1 },
            { result: 2 },
            { result: 3 },
            { result: 4 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── defaultOrderBy fallback ───────────────────────────────────
    // These exercise the compile-time `defaultOrderBy` option, which
    // queryCompiler.ts passes from the containing query's sort fields.
    // BigQuery and Snowflake reject analytic functions with no ORDER BY
    // ("Window ORDER BY is required for analytic function lag"), so these
    // cases regress-guard the fallback that keeps `=LAG(A)` working when
    // the user hasn't written an explicit ORDER BY in the formula.

    {
        id: 'window/lag-default-order',
        formula: '=LAG(A)',
        description:
            'LAG with no formula-level ORDER BY picks up defaultOrderBy (mirrors window/lag)',
        columns: { A: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        defaultOrderBy: [{ column: 'id', direction: 'ASC' }],
        expectedRows: [
            { result: null },
            { result: 100.00 },
            { result: 200.00 },
            { result: 150.00 },
            { result: 300.00 },
            { result: 250.00 },
            { result: 50.00 },
            { result: 75.00 },
            { result: 60.00 },
            { result: 90.00 },
            { result: 80.00 },
            { result: 500.00 },
            { result: 400.00 },
            { result: 450.00 },
            { result: 350.00 },
            { result: 550.00 },
            { result: 10.00 },
            { result: 20.00 },
            { result: 15.00 },
            { result: 25.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lag-user-partition-default-order',
        formula: '=LAG(A, PARTITION BY B)',
        description:
            'User PARTITION BY combines with defaultOrderBy (mirrors window/lag-partitioned)',
        columns: { A: 'amount', B: 'category' },
        sourceTable: 'test_window',
        orderBy: 'id',
        defaultOrderBy: [{ column: 'id', direction: 'ASC' }],
        expectedRows: [
            { result: null }, { result: 100.00 }, { result: 200.00 }, { result: 150.00 }, { result: 300.00 },
            { result: null }, { result: 50.00 }, { result: 75.00 }, { result: 60.00 }, { result: 90.00 },
            { result: null }, { result: 500.00 }, { result: 400.00 }, { result: 450.00 }, { result: 350.00 },
            { result: null }, { result: 10.00 }, { result: 20.00 }, { result: 15.00 }, { result: 25.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lag-user-order-wins-over-default',
        formula: '=LAG(A, ORDER BY B)',
        description:
            'Explicit ORDER BY in the formula always wins over defaultOrderBy',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // defaultOrderBy below would sort by amount DESC if honoured; the
        // expected rows match window/lag (ORDER BY id), proving the user's
        // explicit clause wins.
        defaultOrderBy: [{ column: 'amount', direction: 'DESC' }],
        expectedRows: [
            { result: null },
            { result: 100.00 },
            { result: 200.00 },
            { result: 150.00 },
            { result: 300.00 },
            { result: 250.00 },
            { result: 50.00 },
            { result: 75.00 },
            { result: 60.00 },
            { result: 90.00 },
            { result: 80.00 },
            { result: 500.00 },
            { result: 400.00 },
            { result: 450.00 },
            { result: 350.00 },
            { result: 550.00 },
            { result: 10.00 },
            { result: 20.00 },
            { result: 15.00 },
            { result: 25.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/row-number-default-order',
        formula: '=ROW_NUMBER()',
        description:
            'ROW_NUMBER with no formula-level window clause picks up defaultOrderBy (BigQuery/Snowflake reject OVER () otherwise)',
        columns: {},
        sourceTable: 'test_window',
        orderBy: 'id',
        defaultOrderBy: [{ column: 'id', direction: 'ASC' }],
        expectedRows: [
            { result: 1 }, { result: 2 }, { result: 3 }, { result: 4 }, { result: 5 },
            { result: 6 }, { result: 7 }, { result: 8 }, { result: 9 }, { result: 10 },
            { result: 11 }, { result: 12 }, { result: 13 }, { result: 14 }, { result: 15 },
            { result: 16 }, { result: 17 }, { result: 18 }, { result: 19 }, { result: 20 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── LEAD ──────────────────────────────────────────────────────

    {
        id: 'window/lead',
        formula: '=LEAD(A, ORDER BY B)',
        description: 'Next row value ordered by id (global)',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: 200.00 },
            { result: 150.00 },
            { result: 300.00 },
            { result: 250.00 },
            { result: 50.00 },
            { result: 75.00 },
            { result: 60.00 },
            { result: 90.00 },
            { result: 80.00 },
            { result: 500.00 },
            { result: 400.00 },
            { result: 450.00 },
            { result: 350.00 },
            { result: 550.00 },
            { result: 10.00 },
            { result: 20.00 },
            { result: 15.00 },
            { result: 25.00 },
            { result: 30.00 },
            { result: null },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lead-partitioned',
        formula: '=LEAD(A, PARTITION BY B, ORDER BY C)',
        description: 'Next row value within each category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A by id: 100,200,150,300,250 → lead: 200,150,300,250,null
        // B by id: 50,75,60,90,80 → lead: 75,60,90,80,null
        // C by id: 500,400,450,350,550 → lead: 400,450,350,550,null
        // D by id: 10,20,15,25,30 → lead: 20,15,25,30,null
        expectedRows: [
            { result: 200.00 }, { result: 150.00 }, { result: 300.00 }, { result: 250.00 }, { result: null },
            { result: 75.00 }, { result: 60.00 }, { result: 90.00 }, { result: 80.00 }, { result: null },
            { result: 400.00 }, { result: 450.00 }, { result: 350.00 }, { result: 550.00 }, { result: null },
            { result: 20.00 }, { result: 15.00 }, { result: 25.00 }, { result: 30.00 }, { result: null },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lead-partitioned-by-amount',
        formula: '=LEAD(A, PARTITION BY B, ORDER BY A)',
        description: 'Next value within category when ordered by amount',
        columns: { A: 'amount', B: 'category' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A sorted by amount: 100,150,200,250,300 → lead: 150,200,250,300,null
        //   id1(100)→150, id2(200)→250, id3(150)→200, id4(300)→null, id5(250)→300
        // B sorted by amount: 50,60,75,80,90 → lead: 60,75,80,90,null
        //   id6(50)→60, id7(75)→80, id8(60)→75, id9(90)→null, id10(80)→90
        // C sorted by amount: 350,400,450,500,550 → lead: 400,450,500,550,null
        //   id11(500)→550, id12(400)→450, id13(450)→500, id14(350)→400, id15(550)→null
        // D sorted by amount: 10,15,20,25,30 → lead: 15,20,25,30,null
        //   id16(10)→15, id17(20)→25, id18(15)→20, id19(25)→30, id20(30)→null
        expectedRows: [
            { result: 150.00 }, { result: 250.00 }, { result: 200.00 }, { result: null }, { result: 300.00 },
            { result: 60.00 }, { result: 80.00 }, { result: 75.00 }, { result: null }, { result: 90.00 },
            { result: 550.00 }, { result: 450.00 }, { result: 500.00 }, { result: 400.00 }, { result: null },
            { result: 15.00 }, { result: 25.00 }, { result: 20.00 }, { result: 30.00 }, { result: null },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lead-rank-val',
        formula: '=LEAD(A, ORDER BY B)',
        description: 'LEAD on rank_val column ordered by id',
        columns: { A: 'rank_val', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // rank_vals by id: 10,20,15,30,25,5,8,6,9,7,50,40,45,35,55,1,2,3,4,5
        expectedRows: [
            { result: 20 },
            { result: 15 },
            { result: 30 },
            { result: 25 },
            { result: 5 },
            { result: 8 },
            { result: 6 },
            { result: 9 },
            { result: 7 },
            { result: 50 },
            { result: 40 },
            { result: 45 },
            { result: 35 },
            { result: 55 },
            { result: 1 },
            { result: 2 },
            { result: 3 },
            { result: 4 },
            { result: 5 },
            { result: null },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── CROSS-FUNCTION COMBINATIONS ──────────────────────────────

    {
        id: 'window/lag-first-row-null',
        formula: '=LAG(A, PARTITION BY B, ORDER BY A)',
        description: 'LAG returns NULL for first row in each partition',
        columns: { A: 'rank_val', B: 'category' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A sorted by rank_val: 10,15,20,25,30 → lag: null,10,15,20,25
        //   id1(10)→null, id2(20)→10, id3(15)→null... wait let me recalculate
        // Category A rank_vals: id1=10,id2=20,id3=15,id4=30,id5=25
        //   sorted: 10(id1),15(id3),20(id2),25(id5),30(id4) → lag: null,10,15,20,25
        //   id1→null, id2→15, id3→10, id4→25, id5→20
        // Category B rank_vals: id6=5,id7=8,id8=6,id9=9,id10=7
        //   sorted: 5(id6),6(id8),7(id10),8(id7),9(id9) → lag: null,5,6,7,8
        //   id6→null, id7→7, id8→5, id9→8, id10→6
        // Category C rank_vals: id11=50,id12=40,id13=45,id14=35,id15=55
        //   sorted: 35(id14),40(id12),45(id13),50(id11),55(id15) → lag: null,35,40,45,50
        //   id11→45, id12→35, id13→40, id14→null, id15→50
        // Category D rank_vals: id16=1,id17=2,id18=3,id19=4,id20=5
        //   sorted: 1(id16),2(id17),3(id18),4(id19),5(id20) → lag: null,1,2,3,4
        //   id16→null, id17→1, id18→2, id19→3, id20→4
        expectedRows: [
            { result: null }, { result: 15 }, { result: 10 }, { result: 25 }, { result: 20 },
            { result: null }, { result: 7 }, { result: 5 }, { result: 8 }, { result: 6 },
            { result: 45 }, { result: 35 }, { result: 40 }, { result: null }, { result: 50 },
            { result: null }, { result: 1 }, { result: 2 }, { result: 3 }, { result: 4 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lead-last-row-null',
        formula: '=LEAD(A, PARTITION BY B, ORDER BY A)',
        description: 'LEAD returns NULL for last row in each partition',
        columns: { A: 'rank_val', B: 'category' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Category A rank_vals sorted: 10,15,20,25,30 → lead: 15,20,25,30,null
        //   id1(10)→15, id2(20)→25, id3(15)→20, id4(30)→null, id5(25)→30
        // Category B rank_vals sorted: 5,6,7,8,9 → lead: 6,7,8,9,null
        //   id6(5)→6, id7(8)→9, id8(6)→7, id9(9)→null, id10(7)→8
        // Category C rank_vals sorted: 35,40,45,50,55 → lead: 40,45,50,55,null
        //   id11(50)→55, id12(40)→45, id13(45)→50, id14(35)→40, id15(55)→null
        // Category D rank_vals sorted: 1,2,3,4,5 → lead: 2,3,4,5,null
        //   id16(1)→2, id17(2)→3, id18(3)→4, id19(4)→5, id20(5)→null
        expectedRows: [
            { result: 15 }, { result: 25 }, { result: 20 }, { result: null }, { result: 30 },
            { result: 6 }, { result: 9 }, { result: 7 }, { result: null }, { result: 8 },
            { result: 55 }, { result: 45 }, { result: 50 }, { result: 40 }, { result: null },
            { result: 2 }, { result: 3 }, { result: 4 }, { result: 5 }, { result: null },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/row-number-by-timestamp',
        formula: '=ROW_NUMBER(ORDER BY A)',
        description: 'Row numbering ordered by timestamp',
        columns: { A: 'ts' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Timestamps ordered: each day has 4 rows (A@10, B@11, C@12, D@13)
        // Day1: id1(10:00)→1, id6(11:00)→2, id11(12:00)→3, id16(13:00)→4
        // Day2: id2(10:00)→5, id7(11:00)→6, id12(12:00)→7, id17(13:00)→8
        // Day3: id3(10:00)→9, id8(11:00)→10, id13(12:00)→11, id18(13:00)→12
        // Day4: id4(10:00)→13, id9(11:00)→14, id14(12:00)→15, id19(13:00)→16
        // Day5: id5(10:00)→17, id10(11:00)→18, id15(12:00)→19, id20(13:00)→20
        expectedRows: [
            { result: 1 },   // id1
            { result: 5 },   // id2
            { result: 9 },   // id3
            { result: 13 },  // id4
            { result: 17 },  // id5
            { result: 2 },   // id6
            { result: 6 },   // id7
            { result: 10 },  // id8
            { result: 14 },  // id9
            { result: 18 },  // id10
            { result: 3 },   // id11
            { result: 7 },   // id12
            { result: 11 },  // id13
            { result: 15 },  // id14
            { result: 19 },  // id15
            { result: 4 },   // id16
            { result: 8 },   // id17
            { result: 12 },  // id18
            { result: 16 },  // id19
            { result: 20 },  // id20
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/running-total-by-timestamp',
        formula: '=RUNNING_TOTAL(A, ORDER BY B)',
        description: 'Running total ordered by timestamp (chronological accumulation)',
        columns: { A: 'amount', B: 'ts' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Ordered by ts: id1,id6,id11,id16, id2,id7,id12,id17, id3,id8,id13,id18, id4,id9,id14,id19, id5,id10,id15,id20
        // Amounts:       100,50,500,10,  200,75,400,20,  150,60,450,15,  300,90,350,25,  250,80,550,30
        // Running: 100,150,650,660, 860,935,1335,1355, 1505,1565,2015,2030, 2330,2420,2770,2795, 3045,3125,3675,3705
        // Map back to id order:
        expectedRows: [
            { result: 100.00 },    // id1: pos 1
            { result: 860.00 },    // id2: pos 5
            { result: 1505.00 },   // id3: pos 9
            { result: 2330.00 },   // id4: pos 13
            { result: 3045.00 },   // id5: pos 17
            { result: 150.00 },    // id6: pos 2
            { result: 935.00 },    // id7: pos 6
            { result: 1565.00 },   // id8: pos 10
            { result: 2420.00 },   // id9: pos 14
            { result: 3125.00 },   // id10: pos 18
            { result: 650.00 },    // id11: pos 3
            { result: 1335.00 },   // id12: pos 7
            { result: 2015.00 },   // id13: pos 11
            { result: 2770.00 },   // id14: pos 15
            { result: 3675.00 },   // id15: pos 19
            { result: 660.00 },    // id16: pos 4
            { result: 1355.00 },   // id17: pos 8
            { result: 2030.00 },   // id18: pos 12
            { result: 2795.00 },   // id19: pos 16
            { result: 3705.00 },   // id20: pos 20
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── RANK ───────────────────────────────────────────────────────

    {
        id: 'window/rank',
        formula: '=RANK(ORDER BY A)',
        description: 'Rank with ties — rank_val=5 appears twice (id6 and id20)',
        columns: { A: 'rank_val' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Sorted rank_vals: 1,2,3,4,5,5,6,7,8,9,10,15,20,25,30,35,40,45,50,55
        // RANK (gaps after ties): 1,2,3,4,5,5,7,8,9,10,11,12,13,14,15,16,17,18,19,20
        expectedRows: [
            { result: 11 },  // id1: rank_val=10
            { result: 13 },  // id2: rank_val=20
            { result: 12 },  // id3: rank_val=15
            { result: 15 },  // id4: rank_val=30
            { result: 14 },  // id5: rank_val=25
            { result: 5 },   // id6: rank_val=5 (tied)
            { result: 9 },   // id7: rank_val=8
            { result: 7 },   // id8: rank_val=6
            { result: 10 },  // id9: rank_val=9
            { result: 8 },   // id10: rank_val=7
            { result: 19 },  // id11: rank_val=50
            { result: 17 },  // id12: rank_val=40
            { result: 18 },  // id13: rank_val=45
            { result: 16 },  // id14: rank_val=35
            { result: 20 },  // id15: rank_val=55
            { result: 1 },   // id16: rank_val=1
            { result: 2 },   // id17: rank_val=2
            { result: 3 },   // id18: rank_val=3
            { result: 4 },   // id19: rank_val=4
            { result: 5 },   // id20: rank_val=5 (tied)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/rank-partitioned',
        formula: '=RANK(PARTITION BY A, ORDER BY B)',
        description: 'Rank within each category by amount',
        columns: { A: 'category', B: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // No ties within partitions, so RANK = ROW_NUMBER here
        // A by amount: 100(1),150(2),200(3),250(4),300(5)
        // B by amount: 50(1),60(2),75(3),80(4),90(5)
        // C by amount: 350(1),400(2),450(3),500(4),550(5)
        // D by amount: 10(1),15(2),20(3),25(4),30(5)
        expectedRows: [
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 5 }, { result: 4 },
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 5 }, { result: 4 },
            { result: 4 }, { result: 2 }, { result: 3 }, { result: 1 }, { result: 5 },
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 4 }, { result: 5 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── DENSE_RANK ─────────────────────────────────────────────────

    {
        id: 'window/dense-rank',
        formula: '=DENSE_RANK(ORDER BY A)',
        description: 'Dense rank with ties — no gap after tied rank_val=5',
        columns: { A: 'rank_val' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Sorted: 1,2,3,4,5,5,6,7,8,9,10,15,20,25,30,35,40,45,50,55
        // DENSE_RANK (no gaps): 1,2,3,4,5,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19
        expectedRows: [
            { result: 10 },  // id1: rank_val=10
            { result: 12 },  // id2: rank_val=20
            { result: 11 },  // id3: rank_val=15
            { result: 14 },  // id4: rank_val=30
            { result: 13 },  // id5: rank_val=25
            { result: 5 },   // id6: rank_val=5 (tied)
            { result: 8 },   // id7: rank_val=8
            { result: 6 },   // id8: rank_val=6
            { result: 9 },   // id9: rank_val=9
            { result: 7 },   // id10: rank_val=7
            { result: 18 },  // id11: rank_val=50
            { result: 16 },  // id12: rank_val=40
            { result: 17 },  // id13: rank_val=45
            { result: 15 },  // id14: rank_val=35
            { result: 19 },  // id15: rank_val=55
            { result: 1 },   // id16: rank_val=1
            { result: 2 },   // id17: rank_val=2
            { result: 3 },   // id18: rank_val=3
            { result: 4 },   // id19: rank_val=4
            { result: 5 },   // id20: rank_val=5 (tied)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/dense-rank-partitioned',
        formula: '=DENSE_RANK(PARTITION BY A, ORDER BY B)',
        description: 'Dense rank within each category by amount',
        columns: { A: 'category', B: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // No ties within partitions, so same as RANK
        expectedRows: [
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 5 }, { result: 4 },
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 5 }, { result: 4 },
            { result: 4 }, { result: 2 }, { result: 3 }, { result: 1 }, { result: 5 },
            { result: 1 }, { result: 3 }, { result: 2 }, { result: 4 }, { result: 5 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── MOVING_SUM ─────────────────────────────────────────────────

    {
        id: 'window/moving-sum',
        formula: '=MOVING_SUM(A, 2, ORDER BY B)',
        description: 'Moving sum with 2 preceding rows (3-row window)',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Amounts by id: 100,200,150,300,250,50,75,60,90,80,500,400,450,350,550,10,20,15,25,30
        // Window = 2 PRECEDING + CURRENT ROW
        expectedRows: [
            { result: 100.00 },    // sum(100)
            { result: 300.00 },    // sum(100,200)
            { result: 450.00 },    // sum(100,200,150)
            { result: 650.00 },    // sum(200,150,300)
            { result: 700.00 },    // sum(150,300,250)
            { result: 600.00 },    // sum(300,250,50)
            { result: 375.00 },    // sum(250,50,75)
            { result: 185.00 },    // sum(50,75,60)
            { result: 225.00 },    // sum(75,60,90)
            { result: 230.00 },    // sum(60,90,80)
            { result: 670.00 },    // sum(90,80,500)
            { result: 980.00 },    // sum(80,500,400)
            { result: 1350.00 },   // sum(500,400,450)
            { result: 1200.00 },   // sum(400,450,350)
            { result: 1350.00 },   // sum(450,350,550)
            { result: 910.00 },    // sum(350,550,10)
            { result: 580.00 },    // sum(550,10,20)
            { result: 45.00 },     // sum(10,20,15)
            { result: 60.00 },     // sum(20,15,25)
            { result: 70.00 },     // sum(15,25,30)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/moving-sum-partitioned',
        formula: '=MOVING_SUM(A, 2, PARTITION BY B, ORDER BY C)',
        description: 'Moving sum with 2 preceding rows within each category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A amounts by id: 100,200,150,300,250
        // B amounts by id: 50,75,60,90,80
        // C amounts by id: 500,400,450,350,550
        // D amounts by id: 10,20,15,25,30
        expectedRows: [
            // Category A
            { result: 100.00 },    // sum(100)
            { result: 300.00 },    // sum(100,200)
            { result: 450.00 },    // sum(100,200,150)
            { result: 650.00 },    // sum(200,150,300)
            { result: 700.00 },    // sum(150,300,250)
            // Category B
            { result: 50.00 },     // sum(50)
            { result: 125.00 },    // sum(50,75)
            { result: 185.00 },    // sum(50,75,60)
            { result: 225.00 },    // sum(75,60,90)
            { result: 230.00 },    // sum(60,90,80)
            // Category C
            { result: 500.00 },    // sum(500)
            { result: 900.00 },    // sum(500,400)
            { result: 1350.00 },   // sum(500,400,450)
            { result: 1200.00 },   // sum(400,450,350)
            { result: 1350.00 },   // sum(450,350,550)
            // Category D
            { result: 10.00 },     // sum(10)
            { result: 30.00 },     // sum(10,20)
            { result: 45.00 },     // sum(10,20,15)
            { result: 60.00 },     // sum(20,15,25)
            { result: 70.00 },     // sum(15,25,30)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── MOVING_AVG ─────────────────────────────────────────────────

    {
        id: 'window/moving-avg',
        formula: '=MOVING_AVG(A, 2, ORDER BY B)',
        description: 'Moving average with 2 preceding rows (3-row window)',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Amounts by id: 100,200,150,300,250,50,75,60,90,80,500,400,450,350,550,10,20,15,25,30
        expectedRows: [
            { result: 100.00 },    // avg(100)
            { result: 150.00 },    // avg(100,200)
            { result: 150.00 },    // avg(100,200,150)
            { result: 216.67 },    // avg(200,150,300)
            { result: 233.33 },    // avg(150,300,250)
            { result: 200.00 },    // avg(300,250,50)
            { result: 125.00 },    // avg(250,50,75)
            { result: 61.67 },     // avg(50,75,60)
            { result: 75.00 },     // avg(75,60,90)
            { result: 76.67 },     // avg(60,90,80)
            { result: 223.33 },    // avg(90,80,500)
            { result: 326.67 },    // avg(80,500,400)
            { result: 450.00 },    // avg(500,400,450)
            { result: 400.00 },    // avg(400,450,350)
            { result: 450.00 },    // avg(450,350,550)
            { result: 303.33 },    // avg(350,550,10)
            { result: 193.33 },    // avg(550,10,20)
            { result: 15.00 },     // avg(10,20,15)
            { result: 20.00 },     // avg(20,15,25)
            { result: 23.33 },     // avg(15,25,30)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── LAG / LEAD WITH OFFSET ─────────────────────────────────────

    {
        id: 'window/lag-offset-2',
        formula: '=LAG(A, 2, ORDER BY B)',
        description: 'LAG with offset 2 — look back 2 rows',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Amounts by id: 100,200,150,300,250,50,75,60,90,80,500,400,450,350,550,10,20,15,25,30
        expectedRows: [
            { result: null },      // id1: no row 2 before
            { result: null },      // id2: no row 2 before
            { result: 100.00 },    // id3: id1's amount
            { result: 200.00 },    // id4: id2's amount
            { result: 150.00 },    // id5: id3
            { result: 300.00 },    // id6: id4
            { result: 250.00 },    // id7: id5
            { result: 50.00 },     // id8: id6
            { result: 75.00 },     // id9: id7
            { result: 60.00 },     // id10: id8
            { result: 90.00 },     // id11: id9
            { result: 80.00 },     // id12: id10
            { result: 500.00 },    // id13: id11
            { result: 400.00 },    // id14: id12
            { result: 450.00 },    // id15: id13
            { result: 350.00 },    // id16: id14
            { result: 550.00 },    // id17: id15
            { result: 10.00 },     // id18: id16
            { result: 20.00 },     // id19: id17
            { result: 15.00 },     // id20: id18
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lag-with-default',
        formula: '=LAG(A, 1, 0, ORDER BY B)',
        description: 'LAG with default value — returns 0 instead of NULL at boundary',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: 0 },        // id1: no previous → default 0
            { result: 100.00 },
            { result: 200.00 },
            { result: 150.00 },
            { result: 300.00 },
            { result: 250.00 },
            { result: 50.00 },
            { result: 75.00 },
            { result: 60.00 },
            { result: 90.00 },
            { result: 80.00 },
            { result: 500.00 },
            { result: 400.00 },
            { result: 450.00 },
            { result: 350.00 },
            { result: 550.00 },
            { result: 10.00 },
            { result: 20.00 },
            { result: 15.00 },
            { result: 25.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lead-offset-2',
        formula: '=LEAD(A, 2, ORDER BY B)',
        description: 'LEAD with offset 2 — look forward 2 rows',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: 150.00 },    // id1: id3's amount
            { result: 300.00 },    // id2: id4
            { result: 250.00 },    // id3: id5
            { result: 50.00 },     // id4: id6
            { result: 75.00 },     // id5: id7
            { result: 60.00 },     // id6: id8
            { result: 90.00 },     // id7: id9
            { result: 80.00 },     // id8: id10
            { result: 500.00 },    // id9: id11
            { result: 400.00 },    // id10: id12
            { result: 450.00 },    // id11: id13
            { result: 350.00 },    // id12: id14
            { result: 550.00 },    // id13: id15
            { result: 10.00 },     // id14: id16
            { result: 20.00 },     // id15: id17
            { result: 15.00 },     // id16: id18
            { result: 25.00 },     // id17: id19
            { result: 30.00 },     // id18: id20
            { result: null },      // id19: no row 2 forward
            { result: null },      // id20: no row 2 forward
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── FIRST / LAST ───────────────────────────────────────────────

    {
        id: 'window/first',
        formula: '=FIRST(A, ORDER BY B)',
        description: 'First value globally — first amount when ordered by id',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // First amount ordered by id = 100 (id1) — every row sees 100
        expectedRows: [
            { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 },
            { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 },
            { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 },
            { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/first-partitioned',
        formula: '=FIRST(A, PARTITION BY B, ORDER BY C)',
        description: 'First value within each category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A first by id: 100 (id1), B: 50 (id6), C: 500 (id11), D: 10 (id16)
        expectedRows: [
            { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 },
            { result: 50.00 }, { result: 50.00 }, { result: 50.00 }, { result: 50.00 }, { result: 50.00 },
            { result: 500.00 }, { result: 500.00 }, { result: 500.00 }, { result: 500.00 }, { result: 500.00 },
            { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/last',
        formula: '=LAST(A, ORDER BY B)',
        description: 'Last value globally — last amount when ordered by id',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Last amount ordered by id = 30 (id20) — every row sees 30
        expectedRows: [
            { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 },
            { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 },
            { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 },
            { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/last-partitioned',
        formula: '=LAST(A, PARTITION BY B, ORDER BY C)',
        description: 'Last value within each category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A last by id: 250 (id5), B: 80 (id10), C: 550 (id15), D: 30 (id20)
        expectedRows: [
            { result: 250.00 }, { result: 250.00 }, { result: 250.00 }, { result: 250.00 }, { result: 250.00 },
            { result: 80.00 }, { result: 80.00 }, { result: 80.00 }, { result: 80.00 }, { result: 80.00 },
            { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 },
            { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 }, { result: 30.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── NTILE ──────────────────────────────────────────────────────

    {
        id: 'window/ntile',
        formula: '=NTILE(4, ORDER BY A)',
        description: 'Divide 20 rows into 4 equal buckets by amount',
        columns: { A: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // 20 rows / 4 buckets = 5 per bucket
        // Sorted by amount: 10,15,20,25,30,50,60,75,80,90,100,150,200,250,300,350,400,450,500,550
        // Buckets:           1, 1, 1, 1, 1, 2, 2, 2, 2, 2,  3,  3,  3,  3,  3,  4,  4,  4,  4,  4
        expectedRows: [
            { result: 3 },   // id1: amount=100 → pos 11 → bucket 3
            { result: 3 },   // id2: amount=200 → pos 13 → bucket 3
            { result: 3 },   // id3: amount=150 → pos 12 → bucket 3
            { result: 3 },   // id4: amount=300 → pos 15 → bucket 3
            { result: 3 },   // id5: amount=250 → pos 14 → bucket 3
            { result: 2 },   // id6: amount=50 → pos 6 → bucket 2
            { result: 2 },   // id7: amount=75 → pos 8 → bucket 2
            { result: 2 },   // id8: amount=60 → pos 7 → bucket 2
            { result: 2 },   // id9: amount=90 → pos 10 → bucket 2
            { result: 2 },   // id10: amount=80 → pos 9 → bucket 2
            { result: 4 },   // id11: amount=500 → pos 19 → bucket 4
            { result: 4 },   // id12: amount=400 → pos 17 → bucket 4
            { result: 4 },   // id13: amount=450 → pos 18 → bucket 4
            { result: 4 },   // id14: amount=350 → pos 16 → bucket 4
            { result: 4 },   // id15: amount=550 → pos 20 → bucket 4
            { result: 1 },   // id16: amount=10 → pos 1 → bucket 1
            { result: 1 },   // id17: amount=20 → pos 3 → bucket 1
            { result: 1 },   // id18: amount=15 → pos 2 → bucket 1
            { result: 1 },   // id19: amount=25 → pos 4 → bucket 1
            { result: 1 },   // id20: amount=30 → pos 5 → bucket 1
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── ORDER BY DIRECTION ─────────────────────────────────────────

    {
        id: 'window/row-number-desc',
        formula: '=ROW_NUMBER(ORDER BY A DESC)',
        description: 'Row numbering with descending order',
        columns: { A: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Amounts sorted DESC: 550,500,450,400,350,300,250,200,150,100,90,80,75,60,50,30,25,20,15,10
        expectedRows: [
            { result: 10 },  // id1: amount=100
            { result: 8 },   // id2: amount=200
            { result: 9 },   // id3: amount=150
            { result: 6 },   // id4: amount=300
            { result: 7 },   // id5: amount=250
            { result: 15 },  // id6: amount=50
            { result: 13 },  // id7: amount=75
            { result: 14 },  // id8: amount=60
            { result: 11 },  // id9: amount=90
            { result: 12 },  // id10: amount=80
            { result: 2 },   // id11: amount=500
            { result: 4 },   // id12: amount=400
            { result: 3 },   // id13: amount=450
            { result: 5 },   // id14: amount=350
            { result: 1 },   // id15: amount=550
            { result: 20 },  // id16: amount=10
            { result: 18 },  // id17: amount=20
            { result: 19 },  // id18: amount=15
            { result: 17 },  // id19: amount=25
            { result: 16 },  // id20: amount=30
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/running-total-desc',
        formula: '=RUNNING_TOTAL(A, ORDER BY B DESC)',
        description: 'Running total with descending order — accumulates from highest id',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Order by id DESC: id20(30),id19(25),id18(15),id17(20),id16(10),id15(550),...,id1(100)
        // Running totals from end: 30,55,70,90,100,650,1000,...,3705
        // Processing order: id20(30),id19(25),id18(15),id17(20),id16(10),id15(550),id14(350),
        //   id13(450),id12(400),id11(500),id10(80),id9(90),id8(60),id7(75),id6(50),
        //   id5(250),id4(300),id3(150),id2(200),id1(100)
        expectedRows: [
            { result: 3705.00 },   // id1: last in DESC order → full total
            { result: 3605.00 },   // id2
            { result: 3405.00 },   // id3
            { result: 3255.00 },   // id4
            { result: 2955.00 },   // id5
            { result: 2705.00 },   // id6
            { result: 2655.00 },   // id7
            { result: 2580.00 },   // id8
            { result: 2520.00 },   // id9
            { result: 2430.00 },   // id10
            { result: 2350.00 },   // id11
            { result: 1850.00 },   // id12
            { result: 1450.00 },   // id13
            { result: 1000.00 },   // id14
            { result: 650.00 },    // id15
            { result: 100.00 },    // id16
            { result: 90.00 },     // id17
            { result: 70.00 },     // id18
            { result: 55.00 },     // id19
            { result: 30.00 },     // id20
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── RANK / DENSE_RANK WITH DESC ────────────────────────────────

    {
        id: 'window/rank-desc',
        formula: '=RANK(ORDER BY A DESC)',
        description: 'Rank descending with ties — tied rank_val=5 at positions 15,15 then gap to 17',
        columns: { A: 'rank_val' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Sorted DESC: 55,50,45,40,35,30,25,20,15,10,9,8,7,6,5,5,4,3,2,1
        // RANK DESC:    1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,15,17,18,19,20
        expectedRows: [
            { result: 10 },  // id1: rank_val=10
            { result: 8 },   // id2: rank_val=20
            { result: 9 },   // id3: rank_val=15
            { result: 6 },   // id4: rank_val=30
            { result: 7 },   // id5: rank_val=25
            { result: 15 },  // id6: rank_val=5 (tied)
            { result: 12 },  // id7: rank_val=8
            { result: 14 },  // id8: rank_val=6
            { result: 11 },  // id9: rank_val=9
            { result: 13 },  // id10: rank_val=7
            { result: 2 },   // id11: rank_val=50
            { result: 4 },   // id12: rank_val=40
            { result: 3 },   // id13: rank_val=45
            { result: 5 },   // id14: rank_val=35
            { result: 1 },   // id15: rank_val=55
            { result: 20 },  // id16: rank_val=1
            { result: 19 },  // id17: rank_val=2
            { result: 18 },  // id18: rank_val=3
            { result: 17 },  // id19: rank_val=4
            { result: 15 },  // id20: rank_val=5 (tied)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/dense-rank-desc',
        formula: '=DENSE_RANK(ORDER BY A DESC)',
        description: 'Dense rank descending — no gap after tied rank_val=5',
        columns: { A: 'rank_val' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // DENSE_RANK DESC: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,16,17,18,19
        expectedRows: [
            { result: 10 },  // id1: rank_val=10
            { result: 8 },   // id2: rank_val=20
            { result: 9 },   // id3: rank_val=15
            { result: 6 },   // id4: rank_val=30
            { result: 7 },   // id5: rank_val=25
            { result: 15 },  // id6: rank_val=5 (tied)
            { result: 12 },  // id7: rank_val=8
            { result: 14 },  // id8: rank_val=6
            { result: 11 },  // id9: rank_val=9
            { result: 13 },  // id10: rank_val=7
            { result: 2 },   // id11: rank_val=50
            { result: 4 },   // id12: rank_val=40
            { result: 3 },   // id13: rank_val=45
            { result: 5 },   // id14: rank_val=35
            { result: 1 },   // id15: rank_val=55
            { result: 19 },  // id16: rank_val=1
            { result: 18 },  // id17: rank_val=2
            { result: 17 },  // id18: rank_val=3
            { result: 16 },  // id19: rank_val=4
            { result: 15 },  // id20: rank_val=5 (tied)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/rank-partitioned-desc',
        formula: '=RANK(PARTITION BY A, ORDER BY B DESC)',
        description: 'Rank descending within each category',
        columns: { A: 'category', B: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A DESC: 300(1),250(2),200(3),150(4),100(5)
        // B DESC: 90(1),80(2),75(3),60(4),50(5)
        // C DESC: 550(1),500(2),450(3),400(4),350(5)
        // D DESC: 30(1),25(2),20(3),15(4),10(5)
        expectedRows: [
            { result: 5 }, { result: 3 }, { result: 4 }, { result: 1 }, { result: 2 },
            { result: 5 }, { result: 3 }, { result: 4 }, { result: 1 }, { result: 2 },
            { result: 2 }, { result: 4 }, { result: 3 }, { result: 5 }, { result: 1 },
            { result: 5 }, { result: 3 }, { result: 4 }, { result: 2 }, { result: 1 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── NTILE VARIATIONS ───────────────────────────────────────────

    {
        id: 'window/ntile-uneven',
        formula: '=NTILE(3, ORDER BY A)',
        description: 'NTILE with uneven split — 20 rows into 3 buckets (7,7,6)',
        columns: { A: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Sorted: 10,15,20,25,30,50,60 | 75,80,90,100,150,200,250 | 300,350,400,450,500,550
        expectedRows: [
            { result: 2 },   // id1: amount=100 → pos 11 → bucket 2
            { result: 2 },   // id2: amount=200 → pos 13 → bucket 2
            { result: 2 },   // id3: amount=150 → pos 12 → bucket 2
            { result: 3 },   // id4: amount=300 → pos 15 → bucket 3
            { result: 2 },   // id5: amount=250 → pos 14 → bucket 2
            { result: 1 },   // id6: amount=50 → pos 6 → bucket 1
            { result: 2 },   // id7: amount=75 → pos 8 → bucket 2
            { result: 1 },   // id8: amount=60 → pos 7 → bucket 1
            { result: 2 },   // id9: amount=90 → pos 10 → bucket 2
            { result: 2 },   // id10: amount=80 → pos 9 → bucket 2
            { result: 3 },   // id11: amount=500 → pos 19 → bucket 3
            { result: 3 },   // id12: amount=400 → pos 17 → bucket 3
            { result: 3 },   // id13: amount=450 → pos 18 → bucket 3
            { result: 3 },   // id14: amount=350 → pos 16 → bucket 3
            { result: 3 },   // id15: amount=550 → pos 20 → bucket 3
            { result: 1 },   // id16: amount=10 → pos 1 → bucket 1
            { result: 1 },   // id17: amount=20 → pos 3 → bucket 1
            { result: 1 },   // id18: amount=15 → pos 2 → bucket 1
            { result: 1 },   // id19: amount=25 → pos 4 → bucket 1
            { result: 1 },   // id20: amount=30 → pos 5 → bucket 1
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/ntile-partitioned',
        formula: '=NTILE(2, PARTITION BY A, ORDER BY B)',
        description: 'NTILE within partitions — 5 rows per category into 2 buckets (3+2)',
        columns: { A: 'category', B: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Each category: 5 rows / 2 buckets = 3 in bucket 1, 2 in bucket 2
        // A by amount: 100(1),150(1),200(1),250(2),300(2)
        // B by amount: 50(1),60(1),75(1),80(2),90(2)
        // C by amount: 350(1),400(1),450(1),500(2),550(2)
        // D by amount: 10(1),15(1),20(1),25(2),30(2)
        expectedRows: [
            { result: 1 }, { result: 1 }, { result: 1 }, { result: 2 }, { result: 2 },
            { result: 1 }, { result: 1 }, { result: 1 }, { result: 2 }, { result: 2 },
            { result: 2 }, { result: 1 }, { result: 1 }, { result: 1 }, { result: 2 },
            { result: 1 }, { result: 1 }, { result: 1 }, { result: 2 }, { result: 2 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── MOVING_AVG PARTITIONED ─────────────────────────────────────

    {
        id: 'window/moving-avg-partitioned',
        formula: '=MOVING_AVG(A, 2, PARTITION BY B, ORDER BY C)',
        description: 'Moving average with 2 preceding rows within each category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            // Category A: 100,200,150,300,250
            { result: 100.00 },    // avg(100)
            { result: 150.00 },    // avg(100,200)
            { result: 150.00 },    // avg(100,200,150)
            { result: 216.67 },    // avg(200,150,300)
            { result: 233.33 },    // avg(150,300,250)
            // Category B: 50,75,60,90,80
            { result: 50.00 },     // avg(50)
            { result: 62.50 },     // avg(50,75)
            { result: 61.67 },     // avg(50,75,60)
            { result: 75.00 },     // avg(75,60,90)
            { result: 76.67 },     // avg(60,90,80)
            // Category C: 500,400,450,350,550
            { result: 500.00 },    // avg(500)
            { result: 450.00 },    // avg(500,400)
            { result: 450.00 },    // avg(500,400,450)
            { result: 400.00 },    // avg(400,450,350)
            { result: 450.00 },    // avg(450,350,550)
            // Category D: 10,20,15,25,30
            { result: 10.00 },     // avg(10)
            { result: 15.00 },     // avg(10,20)
            { result: 15.00 },     // avg(10,20,15)
            { result: 20.00 },     // avg(20,15,25)
            { result: 23.33 },     // avg(15,25,30)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── MOVING_SUM DIFFERENT WINDOW SIZE ───────────────────────────

    {
        id: 'window/moving-sum-1-preceding',
        formula: '=MOVING_SUM(A, 1, ORDER BY B)',
        description: 'Moving sum with 1 preceding row (2-row window)',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: 100.00 },    // sum(100)
            { result: 300.00 },    // sum(100,200)
            { result: 350.00 },    // sum(200,150)
            { result: 450.00 },    // sum(150,300)
            { result: 550.00 },    // sum(300,250)
            { result: 300.00 },    // sum(250,50)
            { result: 125.00 },    // sum(50,75)
            { result: 135.00 },    // sum(75,60)
            { result: 150.00 },    // sum(60,90)
            { result: 170.00 },    // sum(90,80)
            { result: 580.00 },    // sum(80,500)
            { result: 900.00 },    // sum(500,400)
            { result: 850.00 },    // sum(400,450)
            { result: 800.00 },    // sum(450,350)
            { result: 900.00 },    // sum(350,550)
            { result: 560.00 },    // sum(550,10)
            { result: 30.00 },     // sum(10,20)
            { result: 35.00 },     // sum(20,15)
            { result: 40.00 },     // sum(15,25)
            { result: 55.00 },     // sum(25,30)
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── LAG / LEAD EXTENDED VARIANTS ───────────────────────────────

    {
        id: 'window/lag-offset-3',
        formula: '=LAG(A, 3, ORDER BY B)',
        description: 'LAG with offset 3 — look back 3 rows',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: null },      // id1
            { result: null },      // id2
            { result: null },      // id3
            { result: 100.00 },    // id4 ← id1
            { result: 200.00 },    // id5 ← id2
            { result: 150.00 },    // id6 ← id3
            { result: 300.00 },    // id7 ← id4
            { result: 250.00 },    // id8 ← id5
            { result: 50.00 },     // id9 ← id6
            { result: 75.00 },     // id10 ← id7
            { result: 60.00 },     // id11 ← id8
            { result: 90.00 },     // id12 ← id9
            { result: 80.00 },     // id13 ← id10
            { result: 500.00 },    // id14 ← id11
            { result: 400.00 },    // id15 ← id12
            { result: 450.00 },    // id16 ← id13
            { result: 350.00 },    // id17 ← id14
            { result: 550.00 },    // id18 ← id15
            { result: 10.00 },     // id19 ← id16
            { result: 20.00 },     // id20 ← id17
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lead-with-default',
        formula: '=LEAD(A, 1, 0, ORDER BY B)',
        description: 'LEAD with default value — returns 0 instead of NULL at boundary',
        columns: { A: 'amount', B: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            { result: 200.00 },
            { result: 150.00 },
            { result: 300.00 },
            { result: 250.00 },
            { result: 50.00 },
            { result: 75.00 },
            { result: 60.00 },
            { result: 90.00 },
            { result: 80.00 },
            { result: 500.00 },
            { result: 400.00 },
            { result: 450.00 },
            { result: 350.00 },
            { result: 550.00 },
            { result: 10.00 },
            { result: 20.00 },
            { result: 15.00 },
            { result: 25.00 },
            { result: 30.00 },
            { result: 0 },        // id20: no next → default 0
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lag-offset-2-partitioned',
        formula: '=LAG(A, 2, PARTITION BY B, ORDER BY C)',
        description: 'LAG offset 2 within each category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            // Category A by id: 100,200,150,300,250
            { result: null }, { result: null }, { result: 100.00 }, { result: 200.00 }, { result: 150.00 },
            // Category B by id: 50,75,60,90,80
            { result: null }, { result: null }, { result: 50.00 }, { result: 75.00 }, { result: 60.00 },
            // Category C by id: 500,400,450,350,550
            { result: null }, { result: null }, { result: 500.00 }, { result: 400.00 }, { result: 450.00 },
            // Category D by id: 10,20,15,25,30
            { result: null }, { result: null }, { result: 10.00 }, { result: 20.00 }, { result: 15.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/lead-offset-2-partitioned',
        formula: '=LEAD(A, 2, PARTITION BY B, ORDER BY C)',
        description: 'LEAD offset 2 within each category',
        columns: { A: 'amount', B: 'category', C: 'id' },
        sourceTable: 'test_window',
        orderBy: 'id',
        expectedRows: [
            // Category A by id: 100,200,150,300,250
            { result: 150.00 }, { result: 300.00 }, { result: 250.00 }, { result: null }, { result: null },
            // Category B by id: 50,75,60,90,80
            { result: 60.00 }, { result: 90.00 }, { result: 80.00 }, { result: null }, { result: null },
            // Category C by id: 500,400,450,350,550
            { result: 450.00 }, { result: 350.00 }, { result: 550.00 }, { result: null }, { result: null },
            // Category D by id: 10,20,15,25,30
            { result: 15.00 }, { result: 25.00 }, { result: 30.00 }, { result: null }, { result: null },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },

    // ── FIRST / LAST VARIATIONS ────────────────────────────────────

    {
        id: 'window/first-by-amount',
        formula: '=FIRST(A, ORDER BY A)',
        description: 'First value when ordered by amount itself — returns global min',
        columns: { A: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // First amount when sorted by amount ASC = 10 — every row sees 10
        expectedRows: [
            { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 },
            { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 },
            { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 },
            { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/first-partitioned-by-amount',
        formula: '=FIRST(A, PARTITION BY B, ORDER BY A)',
        description: 'First value in partition ordered by amount — returns category min',
        columns: { A: 'amount', B: 'category' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // A min: 100, B min: 50, C min: 350, D min: 10
        expectedRows: [
            { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 }, { result: 100.00 },
            { result: 50.00 }, { result: 50.00 }, { result: 50.00 }, { result: 50.00 }, { result: 50.00 },
            { result: 350.00 }, { result: 350.00 }, { result: 350.00 }, { result: 350.00 }, { result: 350.00 },
            { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 }, { result: 10.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
    {
        id: 'window/last-by-amount',
        formula: '=LAST(A, ORDER BY A)',
        description: 'Last value when ordered by amount itself — returns global max',
        columns: { A: 'amount' },
        sourceTable: 'test_window',
        orderBy: 'id',
        // Last amount when sorted ASC = 550 — every row sees 550
        expectedRows: [
            { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 },
            { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 },
            { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 },
            { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 }, { result: 550.00 },
        ],
        warehouses: ALL_WAREHOUSES,
        tier: 1,
        tags: ['window'],
    },
];
