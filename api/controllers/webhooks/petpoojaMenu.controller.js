const pushMenuWebhook = async (req, res) => {
  try {
    const rawPayload = req.body;

    // Make the request to PetPuja (or just capture what they send us)
    // Since PetPuja is pushing TO us, rawPayload IS their request body
    
    const responseBody = {
      success: "1",
      message: "Menu items are successfully listed."
    };

    await supabase
      .from("patpuja_webhook_logs")
      .insert({
        request_url: req.originalUrl || req.url,
        request_body: rawPayload ?? null,
        response_body: responseBody,
        is_success: true,
        type: "WEBHOOK",
      });

    return res.success({
      message: "Webhook received",
    });

  } catch (err) {
    console.error("Webhook error:", err);

    return res.error({
      message: "Internal server error",
      status: 500,
    });
  }
};