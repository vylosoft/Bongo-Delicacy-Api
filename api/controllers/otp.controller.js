const twilio = require("twilio");
const supabase = require("../../config/db");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/* ============================= */
/* SEND OTP */
/* ============================= */

const sendOTPSMS = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: "Phone number required" });
  }

  try {
    // 🔹 Get latest OTP record
    const { data: lastOtp } = await supabase
      .from("otp_verifications")
      .select("*")
      .eq("phone_to", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastOtp) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Already verified
    //   if (lastOtp.status === "approved") {
    //     return res.status(400).json({
    //       success: false,
    //       message: "Number already verified",
    //     });
    //   }

      // Still within 5 minutes and pending
      if (
        lastOtp.status === "pending" &&
        new Date(lastOtp.created_at) > fiveMinutesAgo
      ) {
        return res.status(400).json({
          success: false,
          message: "OTP already sent. Please wait before requesting again.",
        });
      }
    }

    // 🔹 Send new OTP
    const verification = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to: phone,
        channel: "sms",
      });

    const { data, error } = await supabase
      .from("otp_verifications")
      .insert({
        phone_to: phone,
        phone_from: process.env.TWILIO_PHONE_NUMBER || null,
        twilio_sid: verification.sid,
        status: verification.status,
        channel: "sms",
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: "Failed to store OTP record" });
    }

    return res.json({
      success: true,
      otp_id: data.id,
      message: "OTP sent successfully",
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};


/* ============================= */
/* VERIFY OTP */
/* ============================= */

const verifyOTP = async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone and OTP required" });
  }

  try {
    // 🔹 Get latest OTP record
    const { data: lastOtp } = await supabase
      .from("otp_verifications")
      .select("*")
      .eq("phone_to", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastOtp) {
      return res.status(400).json({ error: "No OTP request found" });
    }

    // Already verified
    if (lastOtp.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Already verified",
      });
    }

    // Expiry check (5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (new Date(lastOtp.created_at) < fiveMinutesAgo) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    // 🔹 Verify with Twilio
    const verificationCheck = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phone,
        code: otp,
      });

    await supabase
      .from("otp_verifications")
      .update({
        status: verificationCheck.status,
      })
      .eq("id", lastOtp.id);

    if (verificationCheck.status === "approved") {
      return res.json({
        success: true,
        message: "OTP verified successfully!",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid OTP",
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};


module.exports = { sendOTPSMS, verifyOTP };
