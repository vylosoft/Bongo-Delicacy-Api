const { checkServiceability, createDeliveryTaskFromOrder, trackTaskStatus, cancelDeliveryTask } = require("../helpers/riderHelper");
const { sendRiderDetailsToPetPuja } = require("../helpers/petpujaHelper.js")
const { riderBookingSchema } = require("../validations/rider.validation.js");
const supabase = require("../../config/db.js");
const crypto = require("crypto");
const Joi = require('joi');
const serviceAvailability = async (req, res) => {
    try {
        const data = {
            ...req.body
        }


        const schema = Joi.object({
            pickupLatitude: Joi.number()
                .min(-90)
                .max(90)
                .required()
                .label('Pickup Latitude'),
            pickupLongitude: Joi.number()
                .min(-180)
                .max(180)
                .required()
                .label('Pickup Longitude'),
            dropLatitude: Joi.number()
                .min(-90)
                .max(90)
                .required()
                .label(' Drop Latitude'),
            dropLongitude: Joi.number()
                .min(-180)
                .max(180)
                .required()
                .label('Drop Longitude'),
        })

        const { error, value } = schema.validate(data, { abortEarly: false });

        if (error) {
            return res.error({
                status: 400,
                message: error.details[0].message
            })
        }
        const { pickupLatitude, pickupLongitude, dropLatitude, dropLongitude } = req.body;


        const deleveryServiceResp = await checkServiceability(pickupLatitude, pickupLongitude, dropLatitude, dropLongitude);
        if (!deleveryServiceResp.success) {
            return res.error({
                status: 400,
                message: "Delivery service is not available for the given coordinates"
            });
        }

        return res.success({
            status: 200,
            data: deleveryServiceResp
        })

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: err.message,
        });
    }
};

const riderBooking = async (req, res) => {
    try {
        const data = {
            ...req.body
        }
        const { error, value } = riderBookingSchema(data);
        if (error) {
            return res.error({
                status: 400,
                message: error.details[0].message
            });
        }
        const { resturent_lat, resturent_lang, resturent_name, resturent_number, resturent_address, resturent_city, order_id } = value;

        const { data: dbData, error: dbError } = await supabase.from("orders").select("*").eq("id", order_id).single();
        // return res.send(dbData)
        if (dbError) {
            return res.error({
                status: 400,
                message: dbError.message
            });
        }
        const fourDigitsOTP = crypto.randomInt(1000, 10000).toString();
        const dataForRiderTask = {
            ...dbData,
            resturent_lat,
            resturent_lang,
            resturent_name,
            resturent_number,
            resturent_address,
            resturent_city,
            otp: fourDigitsOTP
        }

        const riderBookingResp = await createDeliveryTaskFromOrder(dataForRiderTask);
        if (!riderBookingResp.success) {
            return res.error({
                status: 400,
                message: riderBookingResp.error
            });
        }

        console.log("DB DATA:", riderBookingResp);
        const deliveryInfo = {
            ...dbData?.delivery_info,
            taskId: riderBookingResp.data.taskId,
            Status_code: riderBookingResp.data.Status_code,
            store_id: riderBookingResp.meta.store_id,
            access_token: riderBookingResp.meta.access_token,
        }
        console.log("deliveryInfo::", deliveryInfo)
        const { data: updateData, error: updateErr } = await supabase
            .from("orders")
            .update({
                delivery_info: deliveryInfo
            })
            .eq("id", order_id)
            .select()
            .single();
        console.log("DB ==>", updateData, "SAMIRAN::", updateErr)
        return res.success({
            status: 200,
            data: deliveryInfo,
            message: "Rider booking request sent successfuly"
        })

    } catch (err) {
        console.log("error::", err)
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: err.message,
        });
    }

}

const riderCancel = async (req, res) => {
    try {
        const data = {
            ...req.body
        }
        const schema = Joi.object({
            taskId: Joi.string().required().label('Task Id')
        });
        const { error, value } = schema.validate(data, { abortEarly: false });
        if (error) {
            return res.error({
                status: 400,
                message: error.details[0].message
            })
        }
        const { taskId } = value;
        // 🔥 get order using taskId
        const { data: order } = await supabase
            .from("orders")
            .select("delivery_info")
            .eq("delivery_info->>taskId", taskId)
            .maybeSingle();

        if (!order) {
            return res.error({
                status: 404,
                message: "Order not found for this task",
            });
        }

        const cancelRiderResp = await cancelDeliveryTask(
            taskId,
            order?.delivery_info?.store_id,
            order?.delivery_info?.access_token
        );
        if (!cancelRiderResp.success) {
            return res.error({
                status: 400,
                message: error.details[0].message
            })
        }

        return res.success({
            status: 200,
            data: cancelRiderResp,
            message: "Rider cancel request sent successfuly"
        })
    } catch (error) {
        return res.error({
            status: 500,
            message: "Internal server error.",
        })
    }

}

const riderDetails = async (req, res) => {
    try {
        const data = { ...req.body };

        const schema = Joi.object({
            order_id: Joi.string().required().label("Order Id"),
        });

        const { error, value } = schema.validate(data, { abortEarly: false });
        if (error) {
            return res.error({
                status: 400,
                message: error.details[0].message,
            });
        }

        const { order_id } = value;

        // 1. Fetch order
        const { data: orderData, error: dbError } = await supabase
            .from("orders")
            .select("delivery_info")
            .eq("id", order_id)
            .single();

        if (dbError || !orderData) {
            console.log(dbError)
            return res.error({
                status: 404,
                message: "Order not found",
            });
        }

        // 2. Extract taskId
        const taskId = orderData?.delivery_info?.taskId;

        if (!taskId) {
            return res.error({
                status: 400,
                message: "Rider task not created for this order yet",
            });
        }

        /** Call Rider third party api to get rider info */
        const storeId = orderData?.delivery_info?.store_id;
        const accessToken = orderData?.delivery_info?.access_token;

        const riderResp = await trackTaskStatus(
            taskId,
            storeId,
            accessToken
        );

        if (!riderResp.success) {
            return res.error({
                status: 400,
                message: "Unable to fetch rider details",
            });
        }

        const riderData = riderResp.data;
        await sendRiderDetailsToPetPuja({
            status_code: riderResp.data?.status_code,
            data: {
                orderId: order_id,
                taskId: riderData.taskId,
                rider_name: riderData.rider_name,
                rider_contact: riderData.rider_contact,
            },
        });
        const deliveryInfo = {
            ...orderData.delivery_info,
            rider_name: riderData.rider_name,
            rider_contact: riderData.rider_contact,
            tracking_url: riderData.tracking_url,
            rider_lat: riderData.latitude,
            rider_long: riderData.longitude
        }
        const { data: updateData, error: updateErr } = await supabase
            .from("orders")
            .update({
                delivery_info: deliveryInfo
            })
            .eq("id", order_id)
            .select()
            .single();
        return res.success({
            status: 200,
            data: riderResp.data,
            message: "Rider details fetched successfully",
        });

    } catch (err) {
        console.log("riderDetails error:", err);
        return res.error({
            status: 500,
            message: "Internal server error",
        });
    }
};

module.exports = {
    serviceAvailability,
    riderBooking,
    riderDetails,
    riderCancel
};