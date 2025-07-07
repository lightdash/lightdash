SELECT 
    target_type,
    target_value,
    quarter_start_date,
    {{ quarter_end_date('quarter_start_date') }} AS quarter_end_date,
    target_deals,
    target_amount
FROM {{ ref('sales_targets_raw') }}
   