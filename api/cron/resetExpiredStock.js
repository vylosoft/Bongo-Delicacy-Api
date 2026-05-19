const cron = require("node-cron");

const supabase = require("../../config/db");

/* ---------------------------------------
   RUN EVERY MINUTE
--------------------------------------- */

cron.schedule("* * * * *", async () => {
  try {
    console.log(
      "Running stock expiry cron...",
    );

    /* ---------------------------------------
       Fetch unavailable items
    --------------------------------------- */

    const { data, error } =
      await supabase
        .from("menu_item_stock")
        .select("*")

        .eq("in_stock", "0")

        .not(
          "turn_on_time",
          "is",
          null,
        );

    if (error) {
      console.error(
        "Cron fetch error:",
        error,
      );

      return;
    }

    /* ---------------------------------------
       Filter expired items in Node.js
    --------------------------------------- */

    const now = new Date();

    const expiredItems = (
      data || []
    ).filter((item) => {
      return (
        new Date(
          item.turn_on_time,
        ) <= now
      );
    });

    console.log(
      "Expired Items:",
      expiredItems,
    );

    /* ---------------------------------------
       No expired items
    --------------------------------------- */

    if (!expiredItems.length) {
      console.log(
        "No expired items found",
      );

      return;
    }

    /* ---------------------------------------
       Extract IDs
    --------------------------------------- */

    const ids = expiredItems.map(
      (item) => item.id,
    );

    console.log(
      "Resetting IDs:",
      ids,
    );

    /* ---------------------------------------
       Reset stock
    --------------------------------------- */

    const {
      error: updateError,
    } = await supabase
      .from("menu_item_stock")
      .update({
        in_stock: "1",

        turn_on_time: null,

        updated_at:
          new Date().toISOString(),
      })

      .in("id", ids);

    if (updateError) {
      console.error(
        "Update Error:",
        updateError,
      );

      return;
    }

    console.log(
      `Successfully reset ${ids.length} items`,
    );
  } catch (e) {
    console.error(
      "Cron Fatal Error:",
      e,
    );
  }
});