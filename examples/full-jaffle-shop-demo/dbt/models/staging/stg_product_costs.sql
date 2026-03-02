with source as (

    select * from {{ ref('raw_product_costs') }}

),

renamed as (

    select
        id as cost_entry_id,
        product_name,
        category,
        region,
        quarter,
        cost_type,
        amount

    from source

)

select * from renamed
