const { syncRestaurantMenu } = require('../services/menuSync.service');



const syncMenuController = async (req, res) => {
  try {
    const { resturent_identifier } = req.body;

    if (!resturent_identifier) {
      return res.status(400).json({
        success: false,
        message: 'resturent_identifier is required'
      });
    }

    const result = await syncRestaurantMenu(resturent_identifier);

    return res.status(200).json({
      success: true,
      message: 'Menu synced successfully',
      data: result
    });

  } catch (error) {
    console.error('SYNC ERROR:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = { syncMenuController };

