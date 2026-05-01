// api/test.js
export default async function handler(req, res) {
  // 1. 環境変数の取得
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const vaultUrl = process.env.AZURE_KEYVAULT_URL;
  const vercelOidcToken = req.headers['x-vercel-oidc-token'];

  if (!vercelOidcToken) {
    return res.status(401).json({ error: "OIDC Token is missing" });
  }

  try {
    // 2. Azureアクセストークン取得 (OIDC Federation)
    const azureAuthRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: vercelOidcToken,
        scope: 'https://vault.azure.net/.default'
      })
    });
    const { access_token } = await azureAuthRes.json();

    // 3. Key VaultからClaudeのAPIキーを取得
    const kvRes = await fetch(`${vaultUrl}/secrets/avant-csc-claude-api-key?api-version=7.4`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    const kvData = await kvRes.json();
    const claudeApiKey = kvData.value; // シークレットの「値」

    // 4. Claude API (Anthropic) を実行
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello, Claude! Please respond with a short greeting." }]
      })
    });

    const claudeData = await anthropicRes.json();

    // 5. 結果をフロントエンドに返す
    res.status(200).json({
      status: "Success",
      reply: claudeData.content[0].text
    });

  } catch (error) {
    res.status(500).json({ status: "Error", message: error.message });
  }
}