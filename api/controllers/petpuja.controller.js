exports.callbackHandler = async (req, res) => {
  try {
    console.log("PetPuja Callback Received:", req.body);

    return res.status(200).json({
      success: true,
      data: req.body
    });
  } catch (err) {
    console.error("Callback Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};
