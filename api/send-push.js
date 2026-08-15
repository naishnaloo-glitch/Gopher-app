import webpush from 'web-push';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requiredEnv = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      return res.status(500).json({ error: `${key} is not set on the server — check Vercel Environment Variables and redeploy.` });
    }
  }

  const { target, userId, title, body, url } = req.body || {};
  if (!target || !title || !body) {
    return res.status(400).json({ error: 'Missing target, title, or body' });
  }
  if (target === 'user' && !userId) {
    return res.status(400).json({ error: 'target "user" requires a userId' });
  }

  webpush.setVapidDetails(
    'mailto:support@gopherapp.example',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const supabaseHeaders = {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  };

  try {
    let userIds = [];

    if (target === 'user') {
      userIds = [userId];
    } else if (target === 'drivers') {
      const driversRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/profiles?role=eq.driver&select=id`,
        { headers: supabaseHeaders }
      );
      const drivers = await driversRes.json();
      userIds = (drivers || []).map(d => d.id);
    } else {
      return res.status(400).json({ error: 'target must be "user" or "drivers"' });
    }

    if (userIds.length === 0) {
      return res.status(200).json({ success: true, sent: 0, note: 'No matching recipients' });
    }

    const inList = userIds.map(id => `"${id}"`).join(',');
    const subsRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?user_id=in.(${inList})`,
      { headers: supabaseHeaders }
    );
    const subs = await subsRes.json();

    let sent = 0;
    const payload = JSON.stringify({ title, body, url: url || '/' });

    for (const sub of subs || []) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (err) {
        // Subscription expired or was revoked by the browser — clean it up
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${sub.id}`,
            { method: 'DELETE', headers: supabaseHeaders }
          );
        }
      }
    }

    return res.status(200).json({ success: true, sent, totalSubscriptions: (subs || []).length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
