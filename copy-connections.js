require("dotenv").config();
const { query } = require("./src/db");

async function main() {
  // Create ai_connections table if not exists
  await query(`CREATE TABLE IF NOT EXISTS ai_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    provider TEXT NOT NULL,
    api_key_encrypted TEXT,
    status TEXT DEFAULT 'active',
    last_used TIMESTAMPTZ,
    tokens_used BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    auth_type TEXT DEFAULT 'api_key',
    default_model TEXT
  )`);

  // Insert the connections from 46er
  const conns = [
    {id:"af88dc4a-99af-429a-bcd3-a0f63a866717",provider:"anthropic",api_key_encrypted:"7ef49807ce17662ca5b0895f4eedd713:7844a8e8030cd02c5c095fd4ebbd325d:aa5b371f4ab1a0576b89603b21129426f67a91fec2189f5aafc1e53a3b3ee3a55971c46feb8445cf54c707f9677088c5cfe7018162f308ba1567bb1028062971b1e718c72fe132ff2e8405b9c021f404722c4bc127df55b349bdf60d77ae0735a6dec1d2f2234bc44b1da15f",auth_type:"api_key",default_model:"claude-haiku-4-5-20251001"},
    {id:"4a9e9b6e-77b9-4927-a713-d7e2a30a56bf",provider:"anthropic",api_key_encrypted:"6b851d93bfb328eb60fd6f9c:ddd79e1a67c34c1bed8193cefadac242:ba2d855d6b3615d8c73d345ed6bc4661eab72388cec6ae06ac36b4662ddd717a2a2e79293131764d15f757b09d7e6dd0a48b12c40abce6ca412de60f7593c95452b17859b3276303975e779ff9ba9297bb2cda891365870e5dc060817862968561849fad5729308e36a7274e",auth_type:"api_key",default_model:"claude-haiku-4-5-20251001"}
  ];

  for (const c of conns) {
    await query(
      "INSERT INTO ai_connections (id, provider, api_key_encrypted, status, auth_type, default_model) VALUES ($1,$2,$3,'active',$4,$5) ON CONFLICT (id) DO NOTHING",
      [c.id, c.provider, c.api_key_encrypted, c.auth_type, c.default_model]
    );
  }
  console.log("AI connections copied");
  console.log("DONE");
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
