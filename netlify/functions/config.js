// Returns PUBLIC configuration only (safe to expose to browsers).
// Values come from Netlify environment variables so no code change
// is needed when Supabase / Razorpay accounts are set up.
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
      priceMonthly: 299
    })
  };
};
