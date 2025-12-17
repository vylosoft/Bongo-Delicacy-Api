// validations/order.validation.js
const Joi = require("joi");

const saveOrderSchema = (body) => {
  try {
    const schema = Joi.object({
      userId: Joi.string().optional().allow(null, ""),
      orderinfo: Joi.object({
        OrderInfo: Joi.object({
          Restaurant: Joi.object({
            details: Joi.object({
              restID: Joi.string().required()
            }).required()
          }).required(),

          Customer: Joi.object({
            details: Joi.object({
              email: Joi.string().email().required(),
              name: Joi.string().required(),
              address: Joi.string().required(),
              phone: Joi.string().required(),
              latitude: Joi.string().required(),
              longitude: Joi.string().required()
            }).required()
          }).required(),

          Order: Joi.object({
            details: Joi.object({
              orderID: Joi.forbidden(),

              preorder_date: Joi.string().allow("").optional(),
              preorder_time: Joi.string().allow("").optional(),

              service_charge: Joi.string().allow("").optional(),
              sc_tax_amount: Joi.string().allow("").optional(),

              delivery_charges: Joi.string().allow("").optional(),
              dc_tax_percentage: Joi.string().allow("").optional(),
              dc_tax_amount: Joi.string().allow("").optional(),
              dc_gst_details: Joi.array()
                .items(
                  Joi.object({
                    gst_liable: Joi.string().valid("vendor", "restaurant").required(),
                    amount: Joi.string().required()
                  })
                )
                .optional(),

              packing_charges: Joi.string().allow("").optional(),
              pc_tax_amount: Joi.string().allow("").optional(),
              pc_tax_percentage: Joi.string().allow("").optional(),
              pc_gst_details: Joi.array()
                .items(
                  Joi.object({
                    gst_liable: Joi.string().valid("vendor", "restaurant").required(),
                    amount: Joi.string().required()
                  })
                )
                .optional(),

              order_type: Joi.string().required(),
              ondc_bap: Joi.string().optional(),
              advanced_order: Joi.string().optional(),
              urgent_order: Joi.boolean().optional(),
              urgent_time: Joi.number().optional(),
              payment_type: Joi.string().required(),
              table_no: Joi.string().allow("").optional(),
              no_of_persons: Joi.string().allow("").optional(),

              discount_total: Joi.string().optional(),
              tax_total: Joi.string().optional(),
              discount_type: Joi.string().optional(),

              total: Joi.string().required(),
              description: Joi.string().allow("").optional(),
              created_on: Joi.string().required(),

              enable_delivery: Joi.number().optional(),
              min_prep_time: Joi.number().optional(),
              callback_url: Joi.string().optional(),
              collect_cash: Joi.string().allow("").optional(),
              otp: Joi.string().allow("").optional()
            }).required()
          }).required(),

          OrderItem: Joi.object({
            details: Joi.array().items(
              Joi.object({
                id: Joi.string().required(),
                name: Joi.string().required(),
                tax_inclusive: Joi.boolean().required(),
                gst_liability: Joi.string().valid("vendor", "restaurant").required(),

                item_tax: Joi.array().items(
                  Joi.object({
                    id: Joi.string().required(),
                    name: Joi.string().required(),
                    tax_percentage: Joi.string().required(),
                    amount: Joi.string().required()
                  })
                ).optional(),

                item_discount: Joi.string().optional(),
                price: Joi.string().required(),
                final_price: Joi.string().required(),
                quantity: Joi.string().required(),

                description: Joi.string().allow("").optional(),
                variation_name: Joi.string().allow("").optional(),
                variation_id: Joi.string().allow("").optional(),

                AddonItem: Joi.object({
                  details: Joi.array().items(Joi.object()).optional()
                }).optional()
              })
            ).min(1).required()
          }).required(),

          Tax: Joi.object({
            details: Joi.array().items(
              Joi.object({
                id: Joi.string().required(),
                title: Joi.string().required(),
                type: Joi.string().required(),
                price: Joi.string().required(),
                tax: Joi.string().required(),
                restaurant_liable_amt: Joi.string().required()
              })
            )
          }).optional(),

          Discount: Joi.object({
            details: Joi.array().items(
              Joi.object({
                id: Joi.string().required(),
                title: Joi.string().required(),
                type: Joi.string().required(),
                price: Joi.string().required()
              })
            )
          }).optional()
        }).required()
      }).required()
    });

    return schema.validate(body, { abortEarly: false, stripUnknown: true });
  } catch (error) {
    throw new Error(error);
  }
};

module.exports = { saveOrderSchema };
