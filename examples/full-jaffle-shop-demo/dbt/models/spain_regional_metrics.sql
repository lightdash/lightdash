WITH source_data AS (
    SELECT * FROM {{ ref('raw_spain_regional_metrics') }}
),

final AS (
  SELECT
    province_name
    , capital_city
    , latitude
    , longitude
    , customer_count
    , annual_revenue_eur
    , employee_count
    , market_penetration_pct
    , yoy_growth_pct
  FROM source_data
)

SELECT * FROM final
