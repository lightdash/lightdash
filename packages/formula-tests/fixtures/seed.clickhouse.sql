-- ClickHouse seed. Uses ClickHouse-native types and the MergeTree table
-- engine. The generic seed.sql assumes ANSI DDL (VARCHAR, BOOLEAN,
-- TIMESTAMP) which ClickHouse doesn't accept the same way.
--
-- Uses CREATE OR REPLACE TABLE (atomic drop + create) instead of separate
-- DROP + CREATE statements. On ClickHouse Cloud, tables are actually
-- SharedMergeTree replicated across nodes and DROP metadata cleanup can
-- lag asynchronously, which CREATE OR REPLACE avoids entirely.
--
-- Type mapping:
--   INT            → Int32
--   DECIMAL(10,2)  → Decimal(10, 2)
--   VARCHAR(100)   → String          (ClickHouse has no length-bounded VARCHAR)
--   DATE           → Date
--   BOOLEAN        → Bool            (alias for UInt8 in recent versions)
--   TIMESTAMP      → DateTime

CREATE OR REPLACE TABLE test_orders (
    id Int32,
    order_amount Decimal(10, 2),
    tax Decimal(10, 2),
    discount Decimal(10, 2),
    customer_name String,
    category String,
    order_date Date,
    quantity Int32,
    is_returned Bool
) ENGINE = MergeTree() ORDER BY id;

INSERT INTO test_orders VALUES
(1,  100.00, 10.00, 5.00,  'Alice',   'Electronics', '2024-01-15', 2, false),
(2,  250.50, 25.05, 12.50, 'Bob',     'Clothing',    '2024-02-20', 1, false),
(3,  75.00,  7.50,  0.00,  'Charlie', 'Electronics', '2024-03-10', 3, true),
(4,  500.00, 50.00, 25.00, 'Diana',   'Furniture',   '2024-04-05', 1, false),
(5,  30.00,  3.00,  1.50,  'Eve',     'Clothing',    '2024-05-12', 5, false),
(6,  180.00, 18.00, 9.00,  'Frank',   'Electronics', '2024-06-18', 2, true),
(7,  420.00, 42.00, 21.00, 'Grace',   'Furniture',   '2024-07-22', 1, false),
(8,  60.00,  6.00,  3.00,  'Henry',   'Clothing',    '2024-08-30', 4, false),
(9,  310.00, 31.00, 15.50, 'Ivy',     'Electronics', '2024-09-14', 2, false),
(10, 150.00, 15.00, 7.50,  'Jack',    'Furniture',   '2024-10-01', 3, true);

CREATE OR REPLACE TABLE test_nulls (
    id Int32,
    val_a Nullable(Decimal(10, 2)),
    val_b Nullable(String),
    val_c Int32,
    val_d Nullable(Date)
) ENGINE = MergeTree() ORDER BY id;

INSERT INTO test_nulls VALUES
(1, 10.00, 'hello', 100, '2024-01-15'),
(2, NULL,  'world', 200, NULL),
(3, 30.00, NULL,    300, '2024-03-10'),
(4, NULL,  NULL,    400, NULL),
(5, 50.00, 'test',  500, '2024-05-12');

CREATE OR REPLACE TABLE test_window (
    id Int32,
    category String,
    amount Decimal(10, 2),
    ts DateTime,
    rank_val Int32
) ENGINE = MergeTree() ORDER BY id;

INSERT INTO test_window VALUES
(1,  'A', 100.00, '2024-01-01 10:00:00', 10),
(2,  'A', 200.00, '2024-01-02 10:00:00', 20),
(3,  'A', 150.00, '2024-01-03 10:00:00', 15),
(4,  'A', 300.00, '2024-01-04 10:00:00', 30),
(5,  'A', 250.00, '2024-01-05 10:00:00', 25),
(6,  'B', 50.00,  '2024-01-01 11:00:00', 5),
(7,  'B', 75.00,  '2024-01-02 11:00:00', 8),
(8,  'B', 60.00,  '2024-01-03 11:00:00', 6),
(9,  'B', 90.00,  '2024-01-04 11:00:00', 9),
(10, 'B', 80.00,  '2024-01-05 11:00:00', 7),
(11, 'C', 500.00, '2024-01-01 12:00:00', 50),
(12, 'C', 400.00, '2024-01-02 12:00:00', 40),
(13, 'C', 450.00, '2024-01-03 12:00:00', 45),
(14, 'C', 350.00, '2024-01-04 12:00:00', 35),
(15, 'C', 550.00, '2024-01-05 12:00:00', 55),
(16, 'D', 10.00,  '2024-01-01 13:00:00', 1),
(17, 'D', 20.00,  '2024-01-02 13:00:00', 2),
(18, 'D', 15.00,  '2024-01-03 13:00:00', 3),
(19, 'D', 25.00,  '2024-01-04 13:00:00', 4),
(20, 'D', 30.00,  '2024-01-05 13:00:00', 5);
