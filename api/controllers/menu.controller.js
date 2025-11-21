const Joi = require('joi');
const { fetchMenuCatagoryByResturentSchema, fetchMenuByCatagorySchema } = require('../validations/menu.validation');
const { petpujaService } = require('../../utils/petpujaService');

exports.fetchMenuCatagoryByResturent = async (req, res) => {
    try {
        const reqBody = {
            ...req.query
        }
        const validateSchema = fetchMenuCatagoryByResturentSchema(reqBody);
        if (validateSchema.error) {
            return res.error({ message: validateSchema.error.details.map(e => e.message).join(', '), status: 400 });
        }
        const reqData = validateSchema.value;
        const { resturent_identifier } = reqData;
        try {
            const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
            const requestBody = {
                restID: resturent_identifier
            }
            const responseData = await petpujaService(URI, requestBody);
            console.log(responseData);
            const catagories = responseData.categories.map(i => {
                return {
                    id: i.categoryid,
                    name: i.categoryname,
                    active: i.active,
                }
            });
            return res.success({ data: catagories });
        } catch (error) {
            console.log(error);
            return res.error({ message: 'Something went wrong' });
        }
    } catch (err) {
        return res.error({ message: 'Internal server error' });
    }
};

exports.fetchMenuByCatagory = async (req, res) => {
    try {
        const reqBody = {
            ...req.body
        }
        const validateSchema = fetchMenuByCatagorySchema(reqBody);
        if (validateSchema.error) {
            return res.error({ message: validateSchema.error.details.map(e => e.message).join(', '), status: 400 });
        }
        const reqData = validateSchema.value;
        const { resturent_identifier, category_id } = reqData;
        try {
            const URI = `${process.env.PETPUJA_BASE_URL}/mapped_restaurant_menus`;
            const requestBody = {
                restID: resturent_identifier
            }
            const responseData = await petpujaService(URI, requestBody);
            const itemsByCategory = responseData.items.filter(menu => menu.item_categoryid == category_id);
            return res.success({ data: itemsByCategory });
        } catch (error) {
            console.log(error);
            return res.error({ message: 'Something went wrong' });
        }
    } catch (err) {
        return res.error({ message: 'Internal server error' });
    }
}
