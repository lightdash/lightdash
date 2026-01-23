WITH source_data AS (
    SELECT * FROM {{ ref('raw_global_office_locations') }}
),

final AS (
  SELECT
    office_id
    , office_name
    , city
    , country_name
    , country_code
    , region
    , latitude
    , longitude
    , annual_revenue_usd
    , employee_count
    , year_established
    , office_type
  FROM source_data
)

SELECT * FROM final
