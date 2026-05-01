// Vercel serverless function — proxies OneDrive audio via authenticated Graph API.
// Required env vars: ONEDRIVE_CLIENT_ID, ONEDRIVE_REFRESH_TOKEN

let _token  = null;
let _expiry = 0;

async function getAccessToken() {
    if (_token && Date.now() < _expiry - 30_000) return _token;

    const resp = await fetch(
        'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type:    'refresh_token',
                client_id:     process.env.ONEDRIVE_CLIENT_ID,
                refresh_token: process.env.ONEDRIVE_REFRESH_TOKEN,
                scope:         'Files.Read offline_access',
            }).toString(),
        }
    );

    if (!resp.ok) throw new Error(`Token refresh failed: ${await resp.text()}`);

    const data = await resp.json();
    _token  = data.access_token;
    _expiry = Date.now() + data.expires_in * 1000;
    return _token;
}

module.exports = async function handler(req, res) {
    const { u } = req.query;

    if (!u) {
        return res.status(400).json({ error: 'Missing u parameter' });
    }

    try {
        // u is base64-encoded OneDrive sharing URL
        const sharingUrl = Buffer.from(u, 'base64').toString('utf-8');

        // Encode as u!{base64url} for the Graph shares API
        const b64url = Buffer.from(sharingUrl)
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        const token    = await getAccessToken();
        const itemResp = await fetch(
            `https://graph.microsoft.com/v1.0/shares/u!${b64url}/driveItem`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!itemResp.ok) {
            throw new Error(`Graph API returned ${itemResp.status}: ${await itemResp.text()}`);
        }

        const item      = await itemResp.json();
        const downloadUrl = item['@microsoft.graph.downloadUrl'];

        if (!downloadUrl) throw new Error('No download URL in Graph response');

        // Redirect browser directly to the pre-authenticated CDN URL
        res.setHeader('Cache-Control', 'no-store');
        return res.redirect(302, downloadUrl);

    } catch (err) {
        console.error('[audio proxy]', err.message);
        return res.status(502).json({ error: err.message });
    }
};
