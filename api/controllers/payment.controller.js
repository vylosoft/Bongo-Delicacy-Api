const Razorpay = require('razorpay');
const env = require('../../config/env.js');
const { placeOrderWithPetpuja, cancelPetpujaOrder } = require('../helpers/petpujaHelper.js');


// CREATE ORDER
const createOrder = async (req, res) => {
    /**
     * Validate request body with joi
     */

    /** 
     * Call petPuja save api with playload given from my api 
     */
    try {
        const petpujaResponse = await placeOrderWithPetpuja(req.body);
        try {
            const { amount } = req.body;
            const razorpay = new Razorpay({
                key_id: env.RAZORPAY_KEY_ID,     // MUST NOT BE undefined
                key_secret: env.RAZORPAY_KEY_SECRET
            });
            const order = await razorpay.orders.create({
                amount: amount * 100, // convert rupees -> paise
                currency: "INR",
                receipt: `order_rcpt_${Date.now()}`
            });
            /**
             * Call supabase to save order details with status 'created'
             */
            
            return res.status(200).json({
                success: true,
                order
            });
        } catch (error) {
            console.error("Razorpay Order Error:", error);
            /**
             * Cancel petpuja order as payment is failed.
             */
            const petpujaResponse = await cancelPetpujaOrder(req.body);
            return res.status(500).json({
                success: false,
                message: "Failed to create Razorpay order",
                error
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "order can not be created!",
            error
        });
    }



};

// HANDLE PAYMENT SUCCESS OR FAILURE
const handlePaymentResponse = async (req, res) => {
    try {
        const { payment_id, order_id, signature, status } = req.body;

        if (status === "success") {
            return res.status(200).json({ success: true, message: "Payment success" });
        }

        return res.status(400).json({ success: false, message: "Payment failed" });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Error processing payment callback",
            error: err.message
        });
    }
};

module.exports = {
    createOrder,
    handlePaymentResponse
};