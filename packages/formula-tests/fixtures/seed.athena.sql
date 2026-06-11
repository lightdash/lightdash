-- Athena seed. Athena's SQL Engine v3 is Trino, so the query-side syntax
-- matches `seed.trino.sql` exactly — VALUES, INSERT, DECIMAL/DATE literals
-- all work the same. The divergence is on the storage side: every Athena
-- CREATE TABLE needs a backing format + LOCATION. We use Iceberg so the
-- tables support `INSERT INTO` (Hive external tables don't).
--
-- The connection's seed() impl substitutes `__ATHENA_TABLE_LOCATION__` with
-- `s3://${FORMULA_TEST_AT_S3_BUCKET}/${FORMULA_TEST_AT_S3_PREFIX}/<table>/`
-- before executing. Each table gets its own subpath so DROP TABLE leaves
-- the other tables' data intact.

DROP TABLE IF EXISTS test_orders;

CREATE TABLE test_orders (
    id INT,
    order_amount DECIMAL(10,2),
    tax DECIMAL(10,2),
    discount DECIMAL(10,2),
    customer_name STRING,
    category STRING,
    order_date DATE,
    quantity INT,
    is_returned BOOLEAN
)
LOCATION '__ATHENA_TABLE_LOCATION__test_orders/'
TBLPROPERTIES ('table_type'='ICEBERG', 'format'='PARQUET');

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
    id INT,
    val_a DECIMAL(10,2),
    val_b STRING,
    val_c INT,
    val_d DATE
)
LOCATION '__ATHENA_TABLE_LOCATION__test_nulls/'
TBLPROPERTIES ('table_type'='ICEBERG', 'format'='PARQUET');

INSERT INTO test_nulls VALUES
(1, DECIMAL '10.00', 'hello', 100, DATE '2024-01-15'),
(2, NULL,            'world', 200, NULL),
(3, DECIMAL '30.00', NULL,    300, DATE '2024-03-10'),
(4, NULL,            NULL,    400, NULL),
(5, DECIMAL '50.00', 'test',  500, DATE '2024-05-12');

DROP TABLE IF EXISTS test_window;

CREATE TABLE test_window (
    id INT,
    category STRING,
    amount DECIMAL(10,2),
    ts TIMESTAMP,
    rank_val INT
)
LOCATION '__ATHENA_TABLE_LOCATION__test_window/'
TBLPROPERTIES ('table_type'='ICEBERG', 'format'='PARQUET');

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
