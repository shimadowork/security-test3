// api/test.js
export default async function handler(req, res) {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const vaultUrl = process.env.AZURE_KEYVAULT_URL;
  const vercelOidcToken = req.headers['x-vercel-oidc-token'];

  if (!vercelOidcToken) {
    return res.status(401).json({ error: "OIDC Token is missing" });
  }

  try {
    // 1. Azureアクセストークン取得
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
    const authData = await azureAuthRes.json();
    if (!azureAuthRes.ok) return res.status(500).json({ status: "Azure Auth Error", details: authData });

    // 2. Key VaultからAPIキーを取得
    const kvRes = await fetch(`${vaultUrl}/secrets/avant-csc-claude-api-key?api-version=7.4`, {
      headers: { 'Authorization': `Bearer ${authData.access_token}` }
    });
    const kvData = await kvRes.json();
    if (!kvRes.ok) return res.status(500).json({ status: "Key Vault Error", details: kvData });
    
    const claudeApiKey = kvData.value;

    // 3. Claude API (Anthropic) を実行
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: "claude-opus-4-1",
        max_tokens: 1024,
        system: "あなたはITインフラの専門家です。簡潔に回答してください。",
        messages: [{ 
          role: "user", 
          content: "OIDC連携のメリットを教えて。" 
  }]
})
    });

    const claudeData = await anthropicRes.json();

    // Anthropic側でエラーが発生していないかチェック
    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({
        status: "Claude API Error",
        details: claudeData // ここに Anthropic からの具体的なエラー理由が入ります
      });
    }

    // 正常系：回答を返す
    res.status(200).json({
      status: "Success",
      reply: claudeData.content[0].text
    });

  } catch (error) {
    res.status(500).json({ status: "Error", message: error.message });
  }
}
