// Billing: creates Razorpay subscriptions and verifies payments,
// then updates the user's profile in Supabase (service role).
const https = require("https");
const crypto = require("crypto");

function rzp(path, method, body) {
  const auth = Buffer.from(process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET).toString("base64");
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.razorpay.com",
      path: "/v1" + path,
      method: method,
      headers: {
        "Authorization": "Basic " + auth,
        "Content-Type": "application/json",
        "Content-Length": data ? Buffer.byteLength(data) : 0
      }
    }, res => {
      let out = "";
      res.on("data", c => out += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(out) }); }
        catch (e) { reject(new Error("Razorpay bad response: " + out.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

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
  const h = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: h, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: h, body: JSON.stringify({ error: "POST only" }) };

  let p;
  try { p = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, headers: h, body: JSON.stringify({ error: "bad json" }) }; }

  try {
    // ---- CREATE SUBSCRIPTION ----
    if (p.action === "create") {
      if (!p.user_id || !p.email) return { statusCode: 400, headers: h, body: JSON.stringify({ error: "user_id and email required" }) };
      const r = await rzp("/subscriptions", "POST", {
        plan_id: process.env.RAZORPAY_PLAN_ID,
        total_count: 120,          // up to 10 years of monthly cycles
        customer_notify: 1,
        notes: { user_id: p.user_id, email: p.email, product: "aim-screener" }
      });
      if (r.status >= 300) return { statusCode: 500, headers: h, body: JSON.stringify({ error: r.json.error ? r.json.error.description : "Razorpay error" }) };
      return { statusCode: 200, headers: h, body: JSON.stringify({ subscription_id: r.json.id, key_id: process.env.RAZORPAY_KEY_ID }) };
    }

    // ---- VERIFY PAYMENT AFTER CHECKOUT ----
    if (p.action === "verify") {
      const { user_id, razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = p;
      if (!user_id || !razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature)
        return { statusCode: 400, headers: h, body: JSON.stringify({ error: "missing fields" }) };

      const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_payment_id + "|" + razorpay_subscription_id)
        .digest("hex");
      if (expected !== razorpay_signature)
        return { statusCode: 400, headers: h, body: JSON.stringify({ error: "signature mismatch" }) };

      const periodEnd = new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();
      const upd = await supabase("/profiles?id=eq." + encodeURIComponent(user_id), "PATCH", {
        status: "active",
        razorpay_subscription_id: razorpay_subscription_id,
        current_period_end: periodEnd
      });
      if (upd.status >= 300) return { statusCode: 500, headers: h, body: JSON.stringify({ error: "profile update failed", detail: upd.body.slice(0, 200) }) };
      return { statusCode: 200, headers: h, body: JSON.stringify({ ok: true, status: "active", current_period_end: periodEnd }) };
    }

    return { statusCode: 400, headers: h, body: JSON.stringify({ error: "unknown action" }) };
  } catch (e) {
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: e.message }) };
  }
};
