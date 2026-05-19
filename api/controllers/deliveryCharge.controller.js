const supabase = require("../../config/db");

// ==========================
// GET ALL DELIVERY CHARGES
// ==========================
const getAll = async (req, res) => {
    try {

        const page =
            Number(req.query.page) || 1;

        const perPage =
            Number(req.query.per_page) || 20;

        const from =
            (page - 1) * perPage;

        const to =
            from + perPage - 1;

        const {
            data,
            error,
            count
        } = await supabase
            .from("delivery_charges")
            .select("*", {
                count: "exact"
            })
            .order(
                "from_km",
                { ascending: true }
            )
            .range(from, to);

        if (error) {
            console.log(error);

            return res.error({
                message:
                    "Error fetching delivery charges",
                status: 500
            });
        }

        return res.success({
            data: {
                result: data,
                count
            }
        });

    } catch (err) {

        console.log(err);

        return res.error({
            message:
                "Internal server error",
            status: 500
        });

    }
};


// ==========================
// GET SINGLE
// ==========================
const getDetails = async (
    req,
    res
) => {

    try {

        const id =
            req.params.id;

        const {
            data,
            error
        } = await supabase
            .from(
                "delivery_charges"
            )
            .select("*")
            .eq("id", id)
            .single();

        if (error) {

            return res.error({
                message:
                    "Delivery charge not found",
                status: 404
            });

        }

        return res.success({
            data
        });

    } catch (err) {

        console.log(err);

        return res.error({
            message:
                "Internal server error",
            status: 500
        });

    }

};


// ==========================
// ADD
// ==========================
const addDeliveryCharge =
    async (req, res) => {

        try {

            const payload = {

                from_km: Number(
                    req.body.from_km
                ),

                to_km: Number(
                    req.body.to_km
                ),

                charge: Number(
                    req.body.charge
                ),

                is_active:
                    req.body.is_active ?? true

            };


            // validation
            if (
                payload.from_km >=
                payload.to_km
            ) {

                return res.error({

                    message:
                        "From KM must be smaller than To KM",

                    status: 400

                });

            }


            // overlap check
            // allows 0-3 + 3-5
            const {
                data: existing,
                error: overlapError
            }
                =
                await supabase
                    .from(
                        "delivery_charges"
                    )
                    .select("id")
                    .lt(
                        "from_km",
                        payload.to_km
                    )
                    .gt(
                        "to_km",
                        payload.from_km
                    );


            if (overlapError) {

                console.log(
                    overlapError
                );

                return res.error({

                    message:
                        "Overlap check failed",

                    status: 400

                });

            }


            if (
                existing &&
                existing.length > 0
            ) {

                return res.error({

                    message:
                        "Distance range overlaps existing slab",

                    status: 400

                });

            }


            const {
                data,
                error
            }
                =
                await supabase
                    .from(
                        "delivery_charges"
                    )
                    .insert(payload)
                    .select()
                    .single();


            if (error) {

                console.log(error);

                return res.error({

                    message:
                        "Failed to add delivery charge",

                    status: 400

                });

            }


            return res.success({

                data,

                message:
                    "Delivery charge added successfully"

            });

        } catch (err) {

            console.log(err);

            return res.error({

                message:
                    "Internal server error",

                status: 500

            });

        }

    };


// ==========================
// UPDATE
// ==========================
const update =
    async (req, res) => {

        try {

            const id =
                req.params.id;

            const payload = {

                from_km: Number(
                    req.body.from_km
                ),

                to_km: Number(
                    req.body.to_km
                ),

                charge: Number(
                    req.body.charge
                ),

                is_active:
                    req.body.is_active ?? true

            };


            if (
                payload.from_km >=
                payload.to_km
            ) {

                return res.error({

                    message:
                        "From KM must be smaller than To KM",

                    status: 400

                });

            }


            // overlap check excluding self
            const {

                data: existing,
                error: overlapError

            }
                =
                await supabase
                    .from(
                        "delivery_charges"
                    )
                    .select("id")
                    .neq(
                        "id",
                        id
                    )
                    .lt(
                        "from_km",
                        payload.to_km
                    )
                    .gt(
                        "to_km",
                        payload.from_km
                    );


            if (overlapError) {

                console.log(
                    overlapError
                );

                return res.error({

                    message:
                        "Overlap check failed",

                    status: 400

                });

            }


            if (
                existing &&
                existing.length > 0
            ) {

                return res.error({

                    message:
                        "Distance range overlaps existing slab",

                    status: 400

                });

            }


            const {

                data,
                error

            }
                =
                await supabase
                    .from(
                        "delivery_charges"
                    )
                    .update(
                        payload
                    )
                    .eq(
                        "id",
                        id
                    )
                    .select()
                    .single();


            if (error) {

                console.log(error);

                return res.error({

                    message:
                        "Update failed",

                    status: 400

                });

            }


            return res.success({

                data,

                message:
                    "Delivery charge updated successfully"

            });

        } catch (err) {

            console.log(err);

            return res.error({

                message:
                    "Internal server error",

                status: 500

            });

        }

    };


// ==========================
// DELETE
// ==========================
const remove =
    async (req, res) => {

        try {

            const id =
                req.params.id;

            const {
                error
            }
                =
                await supabase
                    .from(
                        "delivery_charges"
                    )
                    .delete()
                    .eq(
                        "id",
                        id
                    );

            if (error) {

                console.log(error);

                return res.error({

                    message:
                        "Delete failed",

                    status: 400

                });

            }


            return res.success({

                message:
                    "Delivery charge deleted successfully"

            });

        } catch (err) {

            console.log(err);

            return res.error({

                message:
                    "Internal server error",

                status: 500

            });

        }

    };

const getDeliveryCharge = async (
  req,
  res
) => {

  try {

    const {

      restaurantLat,
      restaurantLng,
      deliveryLat,
      deliveryLng

    } = req.body;


    // validation
    if (

      !restaurantLat ||
      !restaurantLng ||
      !deliveryLat ||
      !deliveryLng

    ) {

      return res.error({

        message:
          "Lat/Lng required",

        status: 400

      });

    }


    // use existing formula
    const toRad = (v) =>
      (v * Math.PI) / 180;

    const R = 6371;

    const dLat =
      toRad(
        deliveryLat -
        restaurantLat
      );

    const dLon =
      toRad(
        deliveryLng -
        restaurantLng
      );

    const a =

      Math.sin(
        dLat / 2
      ) ** 2

      +

      Math.cos(
        toRad(
          restaurantLat
        )
      )

      *

      Math.cos(
        toRad(
          deliveryLat
        )
      )

      *

      Math.sin(
        dLon / 2
      ) ** 2;

    const distance =

      R *
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(
          1 - a
        )
      );

    const distanceKm =
      Number(
        distance.toFixed(2)
      );


    // get slab
    const {

      data,
      error

    }
      =
      await supabase
        .from(
          "delivery_charges"
        )
        .select("*")
        .lte(
          "from_km",
          distanceKm
        )
        .gt(
          "to_km",
          distanceKm
        )
        .eq(
          "is_active",
          true
        )
        .single();

    if (error) {

      console.log(error);

      return res.error({

        message:
          "No delivery slab found",

        status: 400

      });

    }


    return res.success({

      data: {

        distance_km:
          distanceKm,

        delivery_charge:
          Number(
            data.charge
          ),

        slab: {
          id: data.id,
          from_km: data.from_km,
          to_km: data.to_km
        }

      }

    });

  } catch (error) {

    console.log(error);

    return res.error({

      message:
        "Internal server error",

      status: 500

    });

  }

};
module.exports = {
    getAll,
    getDetails,
    addDeliveryCharge,
    update,
    remove,
    getDeliveryCharge
};