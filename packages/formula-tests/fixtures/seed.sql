-- Seed data for formula tests
-- Same data across all warehouses for deterministic results

-- test_orders: 10 rows with numeric, string, date columns
DROP TABLE IF EXISTS test_orders;

CREATE TABLE test_orders (
    id INT,
    order_amount DECIMAL(10,2),
    tax DECIMAL(10,2),
    discount DECIMAL(10,2),
    customer_name VARCHAR(100),
    category VARCHAR(50),
    order_date DATE,
    quantity INT,
    is_returned BOOLEAN
);

INSERT INTO test_orders (id, order_amount, tax, discount, customer_name, category, order_date, quantity, is_returned) VALUES
(1,  100.00, 10.00, 5.00,  'Alice',   'Electronics', '2024-01-15', 2,  FALSE),
(2,  250.50, 25.05, 12.50, 'Bob',     'Clothing',    '2024-02-20', 1,  FALSE),
(3,  75.00,  7.50,  0.00,  'Charlie', 'Electronics', '2024-03-10', 3,  TRUE),
(4,  500.00, 50.00, 25.00, 'Diana',   'Furniture',   '2024-04-05', 1,  FALSE),
(5,  30.00,  3.00,  1.50,  'Eve',     'Clothing',    '2024-05-12', 5,  FALSE),
(6,  180.00, 18.00, 9.00,  'Frank',   'Electronics', '2024-06-18', 2,  TRUE),
(7,  420.00, 42.00, 21.00, 'Grace',   'Furniture',   '2024-07-22', 1,  FALSE),
(8,  60.00,  6.00,  3.00,  'Henry',   'Clothing',    '2024-08-30', 4,  FALSE),
(9,  310.00, 31.00, 15.50, 'Ivy',     'Electronics', '2024-09-14', 2,  FALSE),
(10, 150.00, 15.00, 7.50,  'Jack',    'Furniture',   '2024-10-01', 3,  TRUE);

-- test_nulls: 5 rows with NULL values for null-handling tests
DROP TABLE IF EXISTS test_nulls;

CREATE TABLE test_nulls (
    id INT,
    val_a DECIMAL(10,2),
    val_b VARCHAR(50),
    val_c INT,
    val_d DATE
);

INSERT INTO test_nulls (id, val_a, val_b, val_c, val_d) VALUES
(1, 10.00,  'hello', 100, '2024-01-15'),
(2, NULL,   'world', 200, NULL),
(3, 30.00,  NULL,    300, '2024-03-10'),
(4, NULL,   NULL,    400, NULL),
(5, 50.00,  'test',  500, '2024-05-12');

-- test_window: 20 rows for window function testing
DROP TABLE IF EXISTS test_window;

CREATE TABLE test_window (
    id INT,
    category VARCHAR(50),
    amount DECIMAL(10,2),
    ts TIMESTAMP,
    rank_val INT
);

INSERT INTO test_window (id, category, amount, ts, rank_val) VALUES
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
