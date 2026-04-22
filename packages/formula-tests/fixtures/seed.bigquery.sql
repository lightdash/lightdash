CREATE OR REPLACE TABLE test_orders AS
SELECT * FROM UNNEST([
    STRUCT(1 AS id, 100.00 AS order_amount, 10.00 AS tax, 5.00 AS discount, 'Alice' AS customer_name, 'Electronics' AS category, DATE '2024-01-15' AS order_date, 2 AS quantity, false AS is_returned),
    STRUCT(2, 250.50, 25.05, 12.50, 'Bob', 'Clothing', DATE '2024-02-20', 1, false),
    STRUCT(3, 75.00, 7.50, 0.00, 'Charlie', 'Electronics', DATE '2024-03-10', 3, true),
    STRUCT(4, 500.00, 50.00, 25.00, 'Diana', 'Furniture', DATE '2024-04-05', 1, false),
    STRUCT(5, 30.00, 3.00, 1.50, 'Eve', 'Clothing', DATE '2024-05-12', 5, false),
    STRUCT(6, 180.00, 18.00, 9.00, 'Frank', 'Electronics', DATE '2024-06-18', 2, true),
    STRUCT(7, 420.00, 42.00, 21.00, 'Grace', 'Furniture', DATE '2024-07-22', 1, false),
    STRUCT(8, 60.00, 6.00, 3.00, 'Henry', 'Clothing', DATE '2024-08-30', 4, false),
    STRUCT(9, 310.00, 31.00, 15.50, 'Ivy', 'Electronics', DATE '2024-09-14', 2, false),
    STRUCT(10, 150.00, 15.00, 7.50, 'Jack', 'Furniture', DATE '2024-10-01', 3, true)
]);

CREATE OR REPLACE TABLE test_nulls AS
SELECT * FROM UNNEST([
    STRUCT(1 AS id, 10.00 AS val_a, 'hello' AS val_b, 100 AS val_c),
    STRUCT(2, NULL, 'world', 200),
    STRUCT(3, 30.00, CAST(NULL AS STRING), 300),
    STRUCT(4, NULL, CAST(NULL AS STRING), 400),
    STRUCT(5, 50.00, 'test', 500)
]);

CREATE OR REPLACE TABLE test_window AS
SELECT * FROM UNNEST([
    STRUCT(1 AS id, 'A' AS category, 100.00 AS amount, TIMESTAMP '2024-01-01 10:00:00' AS ts, 10 AS rank_val),
    STRUCT(2, 'A', 200.00, TIMESTAMP '2024-01-02 10:00:00', 20),
    STRUCT(3, 'A', 150.00, TIMESTAMP '2024-01-03 10:00:00', 15),
    STRUCT(4, 'A', 300.00, TIMESTAMP '2024-01-04 10:00:00', 30),
    STRUCT(5, 'A', 250.00, TIMESTAMP '2024-01-05 10:00:00', 25),
    STRUCT(6, 'B', 50.00, TIMESTAMP '2024-01-01 11:00:00', 5),
    STRUCT(7, 'B', 75.00, TIMESTAMP '2024-01-02 11:00:00', 8),
    STRUCT(8, 'B', 60.00, TIMESTAMP '2024-01-03 11:00:00', 6),
    STRUCT(9, 'B', 90.00, TIMESTAMP '2024-01-04 11:00:00', 9),
    STRUCT(10, 'B', 80.00, TIMESTAMP '2024-01-05 11:00:00', 7),
    STRUCT(11, 'C', 500.00, TIMESTAMP '2024-01-01 12:00:00', 50),
    STRUCT(12, 'C', 400.00, TIMESTAMP '2024-01-02 12:00:00', 40),
    STRUCT(13, 'C', 450.00, TIMESTAMP '2024-01-03 12:00:00', 45),
    STRUCT(14, 'C', 350.00, TIMESTAMP '2024-01-04 12:00:00', 35),
    STRUCT(15, 'C', 550.00, TIMESTAMP '2024-01-05 12:00:00', 55),
    STRUCT(16, 'D', 10.00, TIMESTAMP '2024-01-01 13:00:00', 1),
    STRUCT(17, 'D', 20.00, TIMESTAMP '2024-01-02 13:00:00', 2),
    STRUCT(18, 'D', 15.00, TIMESTAMP '2024-01-03 13:00:00', 3),
    STRUCT(19, 'D', 25.00, TIMESTAMP '2024-01-04 13:00:00', 4),
    STRUCT(20, 'D', 30.00, TIMESTAMP '2024-01-05 13:00:00', 5)
]);
