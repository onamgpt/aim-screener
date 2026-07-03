// Razorpay webhook: keeps Supabase profile status in sync
// (renewals, cancellations, failed payments) with no manual work.
const https = require("https");
const crypto = require("crypto");

function supabase(path, method, body) {
  const url = new URL(process.env.SUPABASE_URL);
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      path: "/rest/v1" + path,
      method: method,
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_ROLE,
        "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        "Content-Length": data ? Buffer.byteLength(data) : 0
      }
    }, res => {
      let out = "";
      res.on("data", c => out += c);
      res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };

  // Verify webhook signature against RAW body
  const sig = event.headers["x-razorpay-signature"];
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || "")
    .update(event.body).digest("hex");
  if (!sig || sig !== expected) return { statusCode: 401, body: "bad signature" };

  let payload;
  try { payload = JSON.parse(event.body); } catch (e) { return { statusCode: 400, body: "bad json" }; }

  const evt = payload.event;
  const sub = payload.payload && payload.payload.subscription && payload.payload.subscription.entity;
  if (!sub) return { statusCode: 200, body: "ignored" };

  const userId = sub.notes && sub.notes.user_id;
  const filter = userId
    ? "/profiles?id=eq." + encodeURIComponent(userId)
    : "/profiles?razorpay_subscription_id=eq." + encodeURIComponent(sub.id);

  try {
    if (evt === "subscription.charged" || evt === "subscription.activated" || evt === "subscription.resumed") {
      const end = sub.current_end ? new Date(sub.current_end * 1000 + 2 * 24 * 3600 * 1000).toISOString()
                                  : new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();
      await supabase(filter, "PATCH", { status: "active", razorpay_subscription_id: sub.id, current_period_end: end });
    } else if (evt === "subscription.cancelled" || evt === "subscription.completed" || evt === "subscription.expired") {
      await supabase(filter, "PATCH", { status: "cancelled" });
    } else if (evt === "subscription.halted" || evt === "subscription.paused") {
      await supabase(filter, "PATCH", { status: "past_due" });
    }
    return { statusCode: 200, body: "ok" };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};
