const express = require("express");
const router = express.Router();


const outletTableController = require("../controllers/outletTable.controller.js");

router.get("/", outletTableController.getAll);

router.get("/:id", outletTableController.getDetails);

// Get tables
router.get("/:outlet_id/tables", outletTableController.getTablesByOutlet);

// Add restaurant (DB insert only)
router.put("/:id", outletTableController.update);

// Add table
router.post("/", outletTableController.addOutletTable);

// Toggle table active/inactive
router.patch("/:table_id/toggle-status", outletTableController.toggleTableStatus);
// delete table
router.delete("/:table_id", outletTableController.deleteOutletTable);
module.exports = router;
