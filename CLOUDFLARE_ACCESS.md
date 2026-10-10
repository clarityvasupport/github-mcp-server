# Cloudflare Access Integration Guide

This guide explains how to integrate Cloudflare Access with your GitHub MCP Server for enhanced security and access control.

## What is Cloudflare Access?

Cloudflare Access is a Zero Trust security solution that adds authentication in front of your applications without requiring a VPN. It provides:

- **Identity-based access control**: Who can access your MCP server
- **Multiple authentication methods**: Email, Google, GitHub, SAML, etc.
- **Audit logging**: Track who accessed your server and when
- **No code changes required**: Works transparently with your Worker

## Architecture Overview

```
┌─────────────┐
│  MCP Client │ (Claude, Cursor, etc.)
└──────┬──────┘
       │ 1. Request to https://github-mcp-server.workers.dev/sse
       ▼
┌─────────────────────┐
│ Cloudflare Access   │ Authentication Layer
│ ─────────────────── │
│ • Checks JWT        │
│ • Validates policy  │
│ • Redirects if needed│
└──────┬──────────────┘
       │ 2. Authorized? Pass through with JWT
       ▼
┌─────────────────────┐
│  Your Worker        │ GitHub OAuth Layer
│ ─────────────────── │
│ • GitHubMCP Server  │
│ • GitHub OAuth flow │
│ • 26 GitHub tools   │
└─────────────────────┘
       │ 3. Calls GitHub API with user's token
       ▼
┌─────────────────────┐
│   GitHub API        │
└─────────────────────┘
```

## Two-Layer Authentication

1. **Cloudflare Access** (Layer 1): "Can this person access the server at all?"
   - Controlled by you
   - Email domains, specific users, groups, etc.
   - Examples: Only yourcompany.com emails, specific team members

2. **GitHub OAuth** (Layer 2): "What can they do on GitHub?"
   - Controlled by GitHub user's permissions
   - The server acts on behalf of the authenticated user
   - Each user operates within their own GitHub permissions

## Setup Guide

### Step 1: Access Your Cloudflare Dashboard

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Select your account
3. Navigate to **Access** > **Applications**

### Step 2: Create an Access Application

1. Click **Add an application**
2. Choose **Self-hosted**
3. Fill in application details:

```
Application Name: GitHub MCP Server
Subdomain: github-mcp-server
Domain: <your-subdomain>.workers.dev
Path: /
```

**Important**: Make sure the full URL matches your Worker's URL exactly.

### Step 3: Configure Application Settings

#### Session Duration
```
Session Duration: 24 hours (recommended)
```

This controls how long users stay authenticated before needing to re-login.

#### CORS Settings

Leave CORS settings as default unless you have specific requirements.

#### Cookie Settings

Access will set its own authentication cookies - these work alongside the MCP server's OAuth cookies.

### Step 4: Create Access Policies

Access policies define WHO can access your server. You can create multiple policies for different scenarios.

#### Example Policy 1: Single User

```yaml
Policy Name: Only Me
Action: Allow
Include:
  - Emails: you@example.com
```

#### Example Policy 2: Email Domain

```yaml
Policy Name: Company Team
Action: Allow
Include:
  - Email domains ending in: yourcompany.com
```

#### Example Policy 3: Specific Users

```yaml
Policy Name: Development Team
Action: Allow
Include:
  - Emails:
      - alice@example.com
      - bob@example.com
      - charlie@example.com
```

#### Example Policy 4: GitHub-based Auth

```yaml
Policy Name: GitHub Organization Members
Action: Allow
Include:
  - Login Method: GitHub
  - GitHub Organization: your-github-org
```

#### Example Policy 5: Google Workspace

```yaml
Policy Name: Google Workspace Users
Action: Allow
Include:
  - Login Method: Google
  - Email domains ending in: yourcompany.com
```

### Step 5: Choose Authentication Methods

Enable the authentication methods your users will use:

1. **One-time PIN** (Email) - Free, built-in
   - Users receive a code via email
   - No additional setup required

2. **Google** - Free integration
   - Users login with Google account
   - Setup: Add Google OAuth credentials

3. **GitHub** - Free integration
   - Users login with GitHub account
   - Setup: Add GitHub OAuth app

4. **Microsoft Azure AD** - Enterprise
   - Users login with Microsoft account
   - Setup: Configure Azure AD integration

5. **Okta, OneLogin, etc.** - Enterprise SAML
   - For organizations with existing SSO

### Step 6: Test the Configuration

1. Save your Access application
2. Visit your Worker URL in a browser: `https://github-mcp-server.<your-subdomain>.workers.dev`
3. You should see the Cloudflare Access login page
4. Authenticate using one of your configured methods
5. After successful auth, you should reach your MCP server

### Step 7: Configure MCP Clients

#### For Claude Desktop

Add to your config:
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://github-mcp-server.<your-subdomain>.workers.dev/sse"
      ]
    }
  }
}
```

**First-time setup:**
1. Claude will try to connect to your server
2. A browser window will open showing Cloudflare Access login
3. Authenticate with your chosen method (email, Google, etc.)
4. After Access auth, you'll be redirected to GitHub OAuth
5. Authorize the GitHub app
6. Connection established!

**Subsequent connections:**
- Access session lasts 24 hours (or your configured duration)
- No re-authentication needed during session
- After session expires, browser will open for re-auth

## Understanding the Authentication Flow

### Full Flow (First Time)

```
┌──────────────┐
│ Claude Start │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ Request to /sse      │
└──────┬───────────────┘
       │
       ▼
┌────────────────────────┐
│ Cloudflare Access      │ ◄── Not authenticated
│ Redirect to login page │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ User authenticates     │ (Email, Google, GitHub, etc.)
│ with Access            │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Access validates       │
│ Sets JWT cookie        │
│ Redirects back         │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Request to /sse        │ With Access JWT
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Access: Valid JWT      │ ◄── Passes through
│ Allows request         │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Worker: No GitHub auth │ ◄── Start OAuth flow
│ Redirect to /authorize │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ User approves app      │
│ Redirects to GitHub    │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ GitHub OAuth           │
│ User authorizes scopes │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Callback to worker     │
│ Exchange code for token│
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Worker: Store token    │
│ Complete MCP handshake │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Tools available!       │
└────────────────────────┘
```

### Subsequent Connections (Within Session)

```
┌──────────────┐
│ Claude Start │
└──────┬───────┘
       │
       ▼
┌────────────────────────┐
│ Request to /sse        │ With Access JWT cookie
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Access: Valid JWT      │ ◄── Passes through immediately
│ Allows request         │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Worker: Has GitHub     │ ◄── MCP connection established
│ OAuth token cached     │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│ Tools available!       │
└────────────────────────┘
```

## Validating Access JWT in Worker (Optional)

By default, Cloudflare Access handles all validation. However, you can optionally validate the JWT in your Worker for additional security:

### Reading the Access JWT

```typescript
// In your Worker (optional advanced usage)
function getAccessIdentity(request: Request): string | null {
  const jwtToken = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwtToken) return null;
  
  // Decode JWT (don't need to verify - Access already did)
  const payload = JSON.parse(atob(jwtToken.split('.')[1]));
  
  return payload.email || payload.sub;
}

// Use in your handler
const userEmail = getAccessIdentity(c.req.raw);
console.log(`Access authenticated user: ${userEmail}`);
```

### Enforcing Additional Rules

```typescript
// Example: Additional role-based checks
const ADMIN_EMAILS = ['admin@example.com'];

function isAdmin(request: Request): boolean {
  const identity = getAccessIdentity(request);
  return identity ? ADMIN_EMAILS.includes(identity) : false;
}

// In your tool
if (toolName === 'merge_pull_request') {
  if (!isAdmin(c.req.raw)) {
    return c.text('Insufficient permissions', 403);
  }
}
```

## Access Audit Logs

Track who's accessing your server:

1. Go to **Logs** > **Access** in Cloudflare dashboard
2. View authentication events:
   - Who authenticated
   - When they authenticated
   - Which authentication method they used
   - Access granted or denied

### Example Log Entry

```json
{
  "timestamp": "2026-02-23T12:00:00Z",
  "user_email": "user@example.com",
  "action": "login",
  "application": "GitHub MCP Server",
  "country": "US",
  "result": "allowed"
}
```

## Common Scenarios

### Scenario 1: Small Team (2-5 people)

**Setup:**
- Use email-based authentication (free)
- Create one policy with specific email addresses
- Session duration: 7 days

**Config:**
```yaml
Policy: Team Members
Emails:
  - alice@example.com
  - bob@example.com
  - charlie@example.com
```

### Scenario 2: Company Department

**Setup:**
- Use Google Workspace authentication
- Create policy for email domain
- Session duration: 24 hours

**Config:**
```yaml
Policy: Engineering Department
Login Method: Google
Email domain: yourcompany.com
```

### Scenario 3: Open Source Project

**Setup:**
- Use GitHub authentication
- Restrict to GitHub organization members
- Session duration: 1 hour

**Config:**
```yaml
Policy: Project Contributors
Login Method: GitHub
GitHub Organization: your-org
```

### Scenario 4: Contractor + Team Mix

**Setup:**
- Multiple policies
- Different session durations

**Config:**
```yaml
Policy 1: Full-time Team
Email domain: yourcompany.com
Session: 7 days

Policy 2: Contractors
Emails:
  - contractor1@freelance.com
  - contractor2@consultant.com
Session: 8 hours
```

## Troubleshooting

### "Access Denied" Error

**Cause**: User doesn't match any Access policy

**Solution**:
1. Go to Access > Applications > Your App
2. Review policies
3. Add user's email/domain to an Include rule
4. Save policy
5. User should try again

### "JWT Verification Failed"

**Cause**: Clock skew or JWT expiration

**Solution**:
1. Check that your local clock is correct
2. Verify Access application URL matches exactly
3. Clear browser cookies and try again

### Browser Doesn't Open for Authentication

**Cause**: MCP client can't trigger browser

**Solution**:
1. Manually visit: `https://github-mcp-server.<subdomain>.workers.dev`
2. Complete authentication in browser
3. Retry MCP connection

### Session Expires Too Quickly

**Cause**: Short session duration

**Solution**:
1. Go to Access > Applications > Your App
2. Increase "Session Duration" to 24 hours or more
3. Save application

## Best Practices

### 1. Use Multiple Policies

Create separate policies for different user groups:
- Full-time employees
- Contractors
- Admins

### 2. Set Appropriate Session Durations

- **Personal use**: 30 days
- **Team use**: 7 days
- **High security**: 8 hours

### 3. Enable MFA

For sensitive operations, require multi-factor authentication:
1. Access > Settings > Authentication
2. Enable "Require MFA"

### 4. Monitor Access Logs

Set up log retention and alerts:
1. Regularly review who's accessing
2. Set up alerts for denied access attempts
3. Investigate unusual patterns

### 5. Use Service Tokens for CI/CD

For automated tools:
1. Access > Service Auth > Service Tokens
2. Create token for your CI/CD
3. Add to CI environment:
   ```bash
   CF_ACCESS_CLIENT_ID=xxx
   CF_ACCESS_CLIENT_SECRET=xxx
   ```

## Cost

### Free Tier
- Up to 50 users
- Unlimited applications
- Email, Google, GitHub authentication
- Basic audit logs

### Paid Plans
- $3/user/month for additional users
- Advanced authentication methods
- Extended log retention
- Custom claims and policies

For most teams, the free tier is sufficient.

## Security Considerations

✅ **Cloudflare Access provides:**
- DDoS protection
- Bot mitigation
- Geolocation restrictions
- Device posture checks (paid)
- Browser isolation (paid)

✅ **Combined with GitHub OAuth:**
- Two layers of authentication
- Defense in depth
- Audit trail at both layers
- Granular permission control

## Next Steps

1. ✅ Set up Cloudflare Access (this guide)
2. ⬜ Configure audit log retention
3. ⬜ Set up monitoring and alerts
4. ⬜ Test with your team
5. ⬜ Document access policies for your organization

## Resources

- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/applications/)
- [Access Policy Builder](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- [Service Tokens](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/)
- [Audit Logs](https://developers.cloudflare.com/cloudflare-one/analytics/logs/audit-logs/)
