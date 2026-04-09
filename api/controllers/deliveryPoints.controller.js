const supabase = require("../../config/db");
const XLSX = require("xlsx");

// ==========================
// 📤 UPLOAD DELIVERY POINTS
// ==========================
const uploadDeliveryPoints = async (req, res) => {
  try {
    if (!req.file) {
      return res.error({
        message: "File is required",
        status: 400
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];

    const jsonData = XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName]
    );

    if (!jsonData.length) {
      return res.error({
        message: "Empty file",
        status: 400
      });
    }

    // 🔥 store full row inside jsonb
    const formatted = jsonData.map(row => ({
      data: row
    }));

    const { error } = await supabase
      .from("delivery_points")
      .insert(formatted);

    if (error) {
      console.log(error);
      return res.error({
        message: "Upload failed",
        status: 500
      });
    }

    return res.success({
      message: "Delivery points uploaded",
      data: { total: formatted.length }
    });

  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

// ==========================
// 📥 GET DELIVERY POINTS
// ==========================
const getDeliveryPoints = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("delivery_points")
      .select("data") // ✅ hide id

    if (error) {
      console.log(error);
      return res.error({
        message: "Fetch failed",
        status: 500
      });
    }

    return res.success({
      data
    });

  } catch (err) {
    console.log(err);
    return res.error({
      message: "Internal server error",
      status: 500
    });
  }
};

module.exports = {
  uploadDeliveryPoints,
  getDeliveryPoints
};