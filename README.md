# GitHub MCP Server on Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/leelakanakala/github-mcp)

A production-ready **Model Context Protocol (MCP)** server providing all 26 official GitHub tools, deployed on Cloudflare Workers with GitHub OAuth 2.0 authentication.

## Features

- **All 26 official GitHub tools** — files, repos, issues, PRs, search, commits
- **GitHub OAuth 2.0** — per-user authentication, no shared API keys
- **Cloudflare Workers** — global edge deployment, serverless, auto-scaling
- **Durable Objects** — stateful per-user sessions with encrypted token storage
- **Cloudflare Access ready** — optional team-level authentication layer
- **Security** — CSRF protection, state validation, secure cookies, Zod input validation

### Compared to the Official GitHub MCP Server

| Feature | Official Server | This Server |
|---------|----------------|-------------|
| **Deployment** | Local process | Cloudflare Workers (global) |
| **Auth** | PAT (long-lived) | OAuth (short-lived, per-user) |
| **Transport** | STDIO | HTTP + SSE |
| **Multi-user** | No | Yes (Durable Objects) |
| **Access Control** | N/A | Cloudflare Access integration |
| **Scalability** | One user | Unlimited users |

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
npx wrangler whoami  # Note your subdomain (e.g., yourname.workers.dev)
```

### 3. Create GitHub OAuth Apps

Go to https://github.com/settings/developers and create **two** OAuth Apps:

**Production:**
- **Homepage URL**: `https://github-mcp-server.<your-subdomain>.workers.dev`
- **Callback URL**: `https://github-mcp-server.<your-subdomain>.workers.dev/callback`

**Development:**
- **Homepage URL**: `http://localhost:8788`
- **Callback URL**: `http://localhost:8788/callback`

Note the **Client ID** and **Client Secret** for each.

### 4. Configure Local Environment

```bash
cp .dev.vars.example .dev.vars
openssl rand -hex 32  # Generate encryption key
```

Edit `.dev.vars` with your **development** credentials:
```
GITHUB_CLIENT_ID=your_dev_client_id
GITHUB_CLIENT_SECRET=your_dev_client_secret
COOKIE_ENCRYPTION_KEY=your_generated_key
```

### 5. Create KV Namespace

```bash
npx wrangler kv namespace create "OAUTH_KV"
```

Copy the `id` from the output into `wrangler.jsonc`:
```jsonc
"kv_namespaces": [
  {
    "binding": "OAUTH_KV",
    "id": "your_kv_namespace_id"
  }
]
```

Also update `account_id` in `wrangler.jsonc` with your Cloudflare account ID.

### 6. Test Locally

```bash
npm run dev
```

Visit http://localhost:8788. Test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector@latest
```
Enter `http://localhost:8788/sse` and click Connect.

### 7. Deploy to Production

```bash
npx wrangler secret put GITHUB_CLIENT_ID       # Paste PRODUCTION client ID
npx wrangler secret put GITHUB_CLIENT_SECRET    # Paste PRODUCTION client secret
npx wrangler secret put COOKIE_ENCRYPTION_KEY   # Paste encryption key

npm run deploy
```

Your server will be live at `https://github-mcp-server.<your-subdomain>.workers.dev`.

## Usage

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://github-mcp-server.<your-subdomain>.workers.dev/sse"
      ]
    }
  }
}
```

Restart Claude Desktop. A browser window will open for GitHub OAuth on first use.

### Cursor

In Cursor settings, add:
```
Type: Command
Command: npx -y mcp-remote https://github-mcp-server.<your-subdomain>.workers.dev/sse
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest
```
Enter your server URL: `https://github-mcp-server.<your-subdomain>.workers.dev/sse`

## Tools

All 26 official GitHub MCP tools are included:

| Category | Tools |
|----------|-------|
| **Files** (3) | `create_or_update_file`, `push_files`, `get_file_contents` |
| **Repos** (4) | `search_repositories`, `create_repository`, `fork_repository`, `create_branch` |
| **Issues** (5) | `create_issue`, `list_issues`, `update_issue`, `add_issue_comment`, `get_issue` |
| **PRs** (10) | `create_pull_request`, `list_pull_requests`, `get_pull_request`, `merge_pull_request`, `create_pull_request_review`, `get_pull_request_files`, `get_pull_request_status`, `update_pull_request_branch`, `get_pull_request_comments`, `get_pull_request_reviews` |
| **Search** (3) | `search_code`, `search_issues`, `search_users` |
| **Commits** (1) | `list_commits` |

For full parameter details and examples, see [TOOLS.md](./TOOLS.md).

## Cloudflare Access (Optional)

Add a team-level authentication layer in front of the server. See [CLOUDFLARE_ACCESS.md](./CLOUDFLARE_ACCESS.md) for the full setup guide.

The dual-auth flow:
1. **Cloudflare Access** — "Can this person access the server?" (email, SSO, GitHub org, etc.)
2. **GitHub OAuth** — "What can they do on GitHub?" (operates with the user's own permissions)

## Project Structure

```
github-mcp-server/
├── src/
│   ├── index.ts                 # Main MCP server with all 26 tools
│   ├── github-handler.ts        # OAuth authorization flow
│   ├── utils.ts                 # GitHub OAuth utilities
│   ├── workers-oauth-utils.ts   # Security & CSRF protection
│   └── types.ts                 # TypeScript types
├── wrangler.jsonc               # Cloudflare Workers config
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
├── .dev.vars.example            # Local environment template
├── TOOLS.md                     # Complete tools reference
└── CLOUDFLARE_ACCESS.md         # Access integration guide
```

### Key Dependencies

- `@cloudflare/workers-oauth-provider` — OAuth 2.1 server
- `agents` — MCP with Durable Objects
- `hono` — Web framework
- `octokit` — GitHub API client
- `zod` — Schema validation

## Adding Custom Tools

Edit `src/index.ts`:

```typescript
this.server.tool(
  "my_custom_tool",
  "Description of what it does",
  {
    param1: z.string().describe("Parameter description"),
  },
  async ({ param1 }) => {
    const octokit = new Octokit({ auth: this.props!.accessToken });
    // Your implementation
    return {
      content: [{ type: "text", text: "Result" }]
    };
  }
);
```

## Development Commands

```bash
npm run dev          # Local development server (http://localhost:8788)
npm run deploy       # Deploy to Cloudflare Workers
npm run type-check   # TypeScript type checking
npx wrangler tail    # View live production logs
npx wrangler secret list  # Verify secrets are set
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not logged in" | Run `npx wrangler login` |
| Certificate errors | `export NODE_TLS_REJECT_UNAUTHORIZED=0` (dev only) |
| OAuth redirect fails | Verify callback URLs match exactly in GitHub OAuth app settings |
| KV namespace not found | Ensure `id` in `wrangler.jsonc` matches `npx wrangler kv namespace create "OAUTH_KV"` output |
| Tools not showing | Check `npx wrangler tail` logs, verify GitHub token scopes, restart your MCP client |
| Access token expired | Clear browser cookies for your worker domain, re-authenticate |

## Cost

| Service | Free Tier | Paid |
|---------|-----------|------|
| **Workers** | 100K requests/day | $5/mo for 10M requests |
| **Durable Objects** | 1M operations/month | $0.15/million |
| **KV** | 100K reads/day | $0.50/million reads |
| **Access** | Up to 50 users | $3/user/month |

For typical personal/team use, the **free tier is sufficient**.

## GitHub API Scopes

The server requests: `repo`, `read:user`, `read:org`. Users grant these during OAuth.

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/)
- [Octokit REST API](https://octokit.github.io/rest.js/)

## License

MIT
