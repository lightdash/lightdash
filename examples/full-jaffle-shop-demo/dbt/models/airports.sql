with source as (

    select * from {{ ref('raw_airports') }}

),

renamed as (

    select
        name,
        longitude as lon,
        latitude as lat,
        volume

    from source

)

select * from renamed
