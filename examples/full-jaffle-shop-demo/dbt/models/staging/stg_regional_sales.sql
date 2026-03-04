with source as (

    select * from {{ ref('raw_regional_sales') }}

),

renamed as (

    select
        id as sale_id,
        sale_date,
        region,
        product_category,
        units_sold,
        revenue,
        customer_id

    from source

)

select * from renamed
