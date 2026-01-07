const { checkServiceability, createDeliveryTaskFromOrder , trackTaskStatus} = require("../helpers/riderHelper");
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
        const deliveryInfo = dbData.delivery_info;
        deliveryInfo.taskId = riderBookingResp.data.taskId;
        deliveryInfo.Status_code = riderBookingResp.data.Status_code;

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
            data: deliveryInfo,
            message: "Rider booking request sent successfuly"
        })

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: err.message,
        });
    }

}

const riderCancel = async (req, res) => {
    try {
        
    } catch (error) {
        
    }

}

const riderDetails = async (req, res) => {
    try {
        const data = {
            ...req.body
        }
        
        const schema = Joi.object({
            taskId: Joi.string().required().label('Task Id'),

        })

        const { error, value } = schema.validate(data, { abortEarly: false });

        if (error) {
            return res.error({
                status: 400,
                message: error.details[0].message
            })
        }
        const { taskId } = value;
        const riderDetails = await trackTaskStatus(taskId);

        if(!riderDetails.success){
            return res.error({
                status: 400,
            })
        }
        const petpujaResp = await sendRiderDetailsToPetPuja(riderDetails.data);
        console.log("petpujaResp::",petpujaResp)
        return res.success({
            status: 200,
            data: riderDetails
        })
    } catch (error) {
        return res.error({
            status: 500,
            message: "Internal server error.",
        })
    }
}

module.exports = {
    serviceAvailability,
    riderBooking,
    riderDetails,
    riderCancel
};