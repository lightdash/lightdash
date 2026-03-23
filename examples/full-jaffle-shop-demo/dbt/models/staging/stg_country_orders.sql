with source as (

    select * from {{ ref('raw_country_orders') }}

),

renamed as (

    select
        id as order_id,
        order_date,
        country,
        amount

    from source

)

select * from renamed
