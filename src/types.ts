/**
 * Cloudflare Workers Environment Bindings
 */
export interface Env {
	// Secrets (set via wrangler secret put)
	OAUTH_GITHUB_CLIENT_ID: string;
	OAUTH_GITHUB_CLIENT_SECRET: string;
	COOKIE_ENCRYPTION_KEY: string;

	// Durable Object binding
	MCP_OBJECT: DurableObjectNamespace;

	// KV binding for OAuth state
	OAUTH_KV: KVNamespace;
}

/**
 * Buffer is available globally in Cloudflare Workers via nodejs_compat flag
 */
declare global {
	const Buffer: {
		from(str: string, encoding?: string): {
			toString(encoding: string): string;
		};
	};
}
