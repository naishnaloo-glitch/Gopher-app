export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reference, orderId, expectedAmount } = req.body || {};
  if (!reference || !orderId) {
    return res.status(400).json({ error: 'Missing reference or orderId' });
  }

  try {
    // 1. Ask Paystack directly whether this payment really succeeded.
    //    This uses the SECRET key — only ever runs on the server, never in the browser.
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const paystackData = await paystackRes.json();

    if (!paystackData.status || paystackData.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment was not successful' });
    }

    // Defends against a tampered amount being sent from the client
    if (expectedAmount && paystackData.data.amount !== expectedAmount) {
      return res.status(400).json({ error: 'Amount mismatch — refusing to mark as paid' });
    }

    // 2. Mark the order as paid in Supabase using the SERVICE ROLE key,
    //    which bypasses row-level security so this trusted server can update any order.
    const supaRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ payment_status: 'paid', paystack_ref: reference })
      }
    );

    if (!supaRes.ok) {
      const errText = await supaRes.text();
      return res.status(500).json({ error: 'Failed to update order: ' + errText });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
