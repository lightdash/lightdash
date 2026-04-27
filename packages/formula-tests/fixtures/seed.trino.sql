-- Trino seed. Trino requires explicit type prefixes for DATE / TIMESTAMP /
-- DECIMAL literals (`DATE '2024-01-15'`, not bare strings) and uses VARCHAR
-- (no length) rather than VARCHAR(N) for max-length-agnostic strings.
--
-- Tables are created in whatever catalog/schema the connection's `catalog`
-- and `schema` config point at (defaults override-able via FORMULA_TEST_TR_
-- CATALOG / FORMULA_TEST_TR_SCHEMA). The `memory` connector is the simplest
-- setup for a CI / test cluster — the same SQL works against the iceberg,
-- hive, mysql, and postgres connectors.

DROP TABLE IF EXISTS test_orders;

CREATE TABLE test_orders (
    id INTEGER,
    order_amount DECIMAL(10,2),
    tax DECIMAL(10,2),
    discount DECIMAL(10,2),
    customer_name VARCHAR,
    category VARCHAR,
    order_date DATE,
    quantity INTEGER,
    is_returned BOOLEAN
);

INSERT INTO test_orders VALUES
(1,  DECIMAL '100.00', DECIMAL '10.00', DECIMAL '5.00',  'Alice',   'Electronics', DATE '2024-01-15', 2,  FALSE),
(2,  DECIMAL '250.50', DECIMAL '25.05', DECIMAL '12.50', 'Bob',     'Clothing',    DATE '2024-02-20', 1,  FALSE),
(3,  DECIMAL '75.00',  DECIMAL '7.50',  DECIMAL '0.00',  'Charlie', 'Electronics', DATE '2024-03-10', 3,  TRUE),
(4,  DECIMAL '500.00', DECIMAL '50.00', DECIMAL '25.00', 'Diana',   'Furniture',   DATE '2024-04-05', 1,  FALSE),
(5,  DECIMAL '30.00',  DECIMAL '3.00',  DECIMAL '1.50',  'Eve',     'Clothing',    DATE '2024-05-12', 5,  FALSE),
(6,  DECIMAL '180.00', DECIMAL '18.00', DECIMAL '9.00',  'Frank',   'Electronics', DATE '2024-06-18', 2,  TRUE),
(7,  DECIMAL '420.00', DECIMAL '42.00', DECIMAL '21.00', 'Grace',   'Furniture',   DATE '2024-07-22', 1,  FALSE),
(8,  DECIMAL '60.00',  DECIMAL '6.00',  DECIMAL '3.00',  'Henry',   'Clothing',    DATE '2024-08-30', 4,  FALSE),
(9,  DECIMAL '310.00', DECIMAL '31.00', DECIMAL '15.50', 'Ivy',     'Electronics', DATE '2024-09-14', 2,  FALSE),
(10, DECIMAL '150.00', DECIMAL '15.00', DECIMAL '7.50',  'Jack',    'Furniture',   DATE '2024-10-01', 3,  TRUE);

DROP TABLE IF EXISTS test_nulls;

CREATE TABLE test_nulls (
    id INTEGER,
    val_a DECIMAL(10,2),
    val_b VARCHAR,
    val_c INTEGER,
    val_d DATE
);

INSERT INTO test_nulls VALUES
(1, DECIMAL '10.00', 'hello', 100, DATE '2024-01-15'),
(2, NULL,            'world', 200, NULL),
(3, DECIMAL '30.00', NULL,    300, DATE '2024-03-10'),
(4, NULL,            NULL,    400, NULL),
(5, DECIMAL '50.00', 'test',  500, DATE '2024-05-12');

DROP TABLE IF EXISTS test_window;

CREATE TABLE test_window (
    id INTEGER,
    category VARCHAR,
    amount DECIMAL(10,2),
    ts TIMESTAMP,
    rank_val INTEGER
);

INSERT INTO test_window VALUES
(1,  'A', DECIMAL '100.00', TIMESTAMP '2024-01-01 10:00:00', 10),
(2,  'A', DECIMAL '200.00', TIMESTAMP '2024-01-02 10:00:00', 20),
(3,  'A', DECIMAL '150.00', TIMESTAMP '2024-01-03 10:00:00', 15),
(4,  'A', DECIMAL '300.00', TIMESTAMP '2024-01-04 10:00:00', 30),
(5,  'A', DECIMAL '250.00', TIMESTAMP '2024-01-05 10:00:00', 25),
(6,  'B', DECIMAL '50.00',  TIMESTAMP '2024-01-01 11:00:00', 5),
(7,  'B', DECIMAL '75.00',  TIMESTAMP '2024-01-02 11:00:00', 8),
(8,  'B', DECIMAL '60.00',  TIMESTAMP '2024-01-03 11:00:00', 6),
(9,  'B', DECIMAL '90.00',  TIMESTAMP '2024-01-04 11:00:00', 9),
(10, 'B', DECIMAL '80.00',  TIMESTAMP '2024-01-05 11:00:00', 7),
(11, 'C', DECIMAL '500.00', TIMESTAMP '2024-01-01 12:00:00', 50),
(12, 'C', DECIMAL '400.00', TIMESTAMP '2024-01-02 12:00:00', 40),
(13, 'C', DECIMAL '450.00', TIMESTAMP '2024-01-03 12:00:00', 45),
(14, 'C', DECIMAL '350.00', TIMESTAMP '2024-01-04 12:00:00', 35),
(15, 'C', DECIMAL '550.00', TIMESTAMP '2024-01-05 12:00:00', 55),
(16, 'D', DECIMAL '10.00',  TIMESTAMP '2024-01-01 13:00:00', 1),
(17, 'D', DECIMAL '20.00',  TIMESTAMP '2024-01-02 13:00:00', 2),
(18, 'D', DECIMAL '15.00',  TIMESTAMP '2024-01-03 13:00:00', 3),
(19, 'D', DECIMAL '25.00',  TIMESTAMP '2024-01-04 13:00:00', 4),
(20, 'D', DECIMAL '30.00',  TIMESTAMP '2024-01-05 13:00:00', 5);
