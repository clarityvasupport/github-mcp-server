import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Octokit } from "octokit";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import type { Env } from "./types";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
	login: string;
	name: string;
	email: string;
	accessToken: string;
};

/**
 * GitHub MCP Server with all 26 official tools
 * 
 * This Durable Object provides stateful MCP server functionality
 * with full GitHub API access via OAuth
 */
export class GitHubMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "GitHub MCP Server (Cloudflare)",
		version: "1.0.0",
	});

	async init() {
		const octokit = new Octokit({ auth: this.props!.accessToken });

		// ==================== FILE OPERATIONS ====================

		/**
		 * Tool 1: Create or update a single file in a repository
		 */
		this.server.tool(
			"create_or_update_file",
			"Create or update a single file in a repository",
			{
				owner: z.string().describe("Repository owner (username or organization)"),
				repo: z.string().describe("Repository name"),
				path: z.string().describe("Path where to create/update the file"),
				content: z.string().describe("Content of the file"),
				message: z.string().describe("Commit message"),
				branch: z.string().describe("Branch to create/update the file in"),
				sha: z.string().optional().describe("SHA of file being replaced (for updates)"),
			},
			async ({ owner, repo, path, content, message, branch, sha }) => {
				try {
					// Ensure branch exists
					try {
						await octokit.rest.repos.getBranch({ owner, repo, branch });
					} catch (error: any) {
						if (error.status === 404) {
							// Branch doesn't exist, create it from default branch
							const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
							const { data: defaultBranch } = await octokit.rest.repos.getBranch({
								owner,
								repo,
								branch: repoData.default_branch,
							});
							await octokit.rest.git.createRef({
								owner,
								repo,
								ref: `refs/heads/${branch}`,
								sha: defaultBranch.commit.sha,
							});
						} else {
							throw error;
						}
					}

					const result = await octokit.rest.repos.createOrUpdateFileContents({
						owner,
						repo,
						path,
						message,
						content: Buffer.from(content).toString("base64"),
						branch,
						...(sha && { sha }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 2: Push multiple files in a single commit
		 */
		this.server.tool(
			"push_files",
			"Push multiple files in a single commit",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				branch: z.string().describe("Branch to push to"),
				files: z
					.array(
						z.object({
							path: z.string(),
							content: z.string(),
						})
					)
					.describe("Files to push, each with path and content"),
				message: z.string().describe("Commit message"),
			},
			async ({ owner, repo, branch, files, message }) => {
				try {
					// Get the current branch reference
					let ref;
					try {
						const branchData = await octokit.rest.repos.getBranch({ owner, repo, branch });
						ref = branchData.data.commit.sha;
					} catch (error: any) {
						if (error.status === 404) {
							// Branch doesn't exist, create from default
							const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
							const { data: defaultBranch } = await octokit.rest.repos.getBranch({
								owner,
								repo,
								branch: repoData.default_branch,
							});
							ref = defaultBranch.commit.sha;
							await octokit.rest.git.createRef({
								owner,
								repo,
								ref: `refs/heads/${branch}`,
								sha: ref,
							});
						} else {
							throw error;
						}
					}

					// Get the current commit
					const { data: currentCommit } = await octokit.rest.git.getCommit({
						owner,
						repo,
						commit_sha: ref,
					});

					// Create blobs for each file
					const blobs = await Promise.all(
						files.map(async (file) => {
							const { data: blob } = await octokit.rest.git.createBlob({
								owner,
								repo,
								content: Buffer.from(file.content).toString("base64"),
								encoding: "base64",
							});
							return { path: file.path, sha: blob.sha };
						})
					);

					// Create a new tree
					const { data: newTree } = await octokit.rest.git.createTree({
						owner,
						repo,
						base_tree: currentCommit.tree.sha,
						tree: blobs.map((blob) => ({
							path: blob.path,
							mode: "100644" as const,
							type: "blob" as const,
							sha: blob.sha,
						})),
					});

					// Create a new commit
					const { data: newCommit } = await octokit.rest.git.createCommit({
						owner,
						repo,
						message,
						tree: newTree.sha,
						parents: [ref],
					});

					// Update the reference
					await octokit.rest.git.updateRef({
						owner,
						repo,
						ref: `heads/${branch}`,
						sha: newCommit.sha,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({ commit: newCommit }, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 3: Get contents of a file or directory
		 */
		this.server.tool(
			"get_file_contents",
			"Get contents of a file or directory from a repository",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				path: z.string().describe("Path to file/directory"),
				branch: z.string().optional().describe("Branch to get contents from"),
			},
			async ({ owner, repo, path, branch }) => {
				try {
					const result = await octokit.rest.repos.getContent({
						owner,
						repo,
						path,
						...(branch && { ref: branch }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		// ==================== REPOSITORY OPERATIONS ====================

		/**
		 * Tool 4: Search for GitHub repositories
		 */
		this.server.tool(
			"search_repositories",
			"Search for GitHub repositories",
			{
				query: z.string().describe("Search query (e.g., 'language:typescript stars:>1000')"),
				page: z.number().optional().describe("Page number for pagination"),
				perPage: z.number().max(100).optional().describe("Results per page (max 100)"),
			},
			async ({ query, page, perPage }) => {
				try {
					const result = await octokit.rest.search.repos({
						q: query,
						...(page && { page }),
						...(perPage && { per_page: perPage }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 5: Create a new GitHub repository
		 */
		this.server.tool(
			"create_repository",
			"Create a new GitHub repository",
			{
				name: z.string().describe("Repository name"),
				description: z.string().optional().describe("Repository description"),
				private: z.boolean().optional().describe("Whether repo should be private"),
				autoInit: z.boolean().optional().describe("Initialize with README"),
			},
			async ({ name, description, private: isPrivate, autoInit }) => {
				try {
					const result = await octokit.rest.repos.createForAuthenticatedUser({
						name,
						...(description && { description }),
						...(isPrivate !== undefined && { private: isPrivate }),
						...(autoInit && { auto_init: autoInit }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 6: Fork a repository
		 */
		this.server.tool(
			"fork_repository",
			"Fork a repository to your account or an organization",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				organization: z.string().optional().describe("Organization to fork to (optional)"),
			},
			async ({ owner, repo, organization }) => {
				try {
					const result = await octokit.rest.repos.createFork({
						owner,
						repo,
						...(organization && { organization }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 7: Create a new branch
		 */
		this.server.tool(
			"create_branch",
			"Create a new branch in a repository",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				branch: z.string().describe("Name for new branch"),
				from_branch: z.string().optional().describe("Source branch (defaults to repo default)"),
			},
			async ({ owner, repo, branch, from_branch }) => {
				try {
					// Get source branch SHA
					let sourceSha: string;
					if (from_branch) {
						const { data: branchData } = await octokit.rest.repos.getBranch({
							owner,
							repo,
							branch: from_branch,
						});
						sourceSha = branchData.commit.sha;
					} else {
						const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
						const { data: defaultBranch } = await octokit.rest.repos.getBranch({
							owner,
							repo,
							branch: repoData.default_branch,
						});
						sourceSha = defaultBranch.commit.sha;
					}

					const result = await octokit.rest.git.createRef({
						owner,
						repo,
						ref: `refs/heads/${branch}`,
						sha: sourceSha,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		// ==================== ISSUE OPERATIONS ====================

		/**
		 * Tool 8: Create a new issue
		 */
		this.server.tool(
			"create_issue",
			"Create a new issue in a repository",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				title: z.string().describe("Issue title"),
				body: z.string().optional().describe("Issue description"),
				assignees: z.array(z.string()).optional().describe("Usernames to assign"),
				labels: z.array(z.string()).optional().describe("Labels to add"),
				milestone: z.number().optional().describe("Milestone number"),
			},
			async ({ owner, repo, title, body, assignees, labels, milestone }) => {
				try {
					const result = await octokit.rest.issues.create({
						owner,
						repo,
						title,
						...(body && { body }),
						...(assignees && { assignees }),
						...(labels && { labels }),
						...(milestone && { milestone }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 9: List issues with filters
		 */
		this.server.tool(
			"list_issues",
			"List and filter repository issues",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state"),
				labels: z.array(z.string()).optional().describe("Filter by labels"),
				sort: z.enum(["created", "updated", "comments"]).optional().describe("Sort by"),
				direction: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
				since: z.string().optional().describe("Filter by date (ISO 8601 timestamp)"),
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Results per page"),
			},
			async ({ owner, repo, state, labels, sort, direction, since, page, per_page }) => {
				try {
					const result = await octokit.rest.issues.listForRepo({
						owner,
						repo,
						...(state && { state }),
						...(labels && { labels: labels.join(",") }),
						...(sort && { sort }),
						...(direction && { direction }),
						...(since && { since }),
						...(page && { page }),
						...(per_page && { per_page }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 10: Update an existing issue
		 */
		this.server.tool(
			"update_issue",
			"Update an existing issue",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issue_number: z.number().describe("Issue number to update"),
				title: z.string().optional().describe("New title"),
				body: z.string().optional().describe("New description"),
				state: z.enum(["open", "closed"]).optional().describe("New state"),
				labels: z.array(z.string()).optional().describe("New labels"),
				assignees: z.array(z.string()).optional().describe("New assignees"),
				milestone: z.number().optional().describe("New milestone number"),
			},
			async ({ owner, repo, issue_number, title, body, state, labels, assignees, milestone }) => {
				try {
					const result = await octokit.rest.issues.update({
						owner,
						repo,
						issue_number,
						...(title && { title }),
						...(body && { body }),
						...(state && { state }),
						...(labels && { labels }),
						...(assignees && { assignees }),
						...(milestone !== undefined && { milestone }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 11: Add a comment to an issue
		 */
		this.server.tool(
			"add_issue_comment",
			"Add a comment to an issue",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issue_number: z.number().describe("Issue number to comment on"),
				body: z.string().describe("Comment text"),
			},
			async ({ owner, repo, issue_number, body }) => {
				try {
					const result = await octokit.rest.issues.createComment({
						owner,
						repo,
						issue_number,
						body,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 12: Get a single issue
		 */
		this.server.tool(
			"get_issue",
			"Get details of a single issue",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issue_number: z.number().describe("Issue number to retrieve"),
			},
			async ({ owner, repo, issue_number }) => {
				try {
					const result = await octokit.rest.issues.get({
						owner,
						repo,
						issue_number,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		// ==================== PULL REQUEST OPERATIONS ====================

		/**
		 * Tool 13: Create a pull request
		 */
		this.server.tool(
			"create_pull_request",
			"Create a new pull request",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				title: z.string().describe("PR title"),
				body: z.string().optional().describe("PR description"),
				head: z.string().describe("Branch containing changes"),
				base: z.string().describe("Branch to merge into"),
				draft: z.boolean().optional().describe("Create as draft PR"),
				maintainer_can_modify: z.boolean().optional().describe("Allow maintainer edits"),
			},
			async ({ owner, repo, title, body, head, base, draft, maintainer_can_modify }) => {
				try {
					const result = await octokit.rest.pulls.create({
						owner,
						repo,
						title,
						head,
						base,
						...(body && { body }),
						...(draft !== undefined && { draft }),
						...(maintainer_can_modify !== undefined && { maintainer_can_modify }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 14: List pull requests
		 */
		this.server.tool(
			"list_pull_requests",
			"List and filter repository pull requests",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state"),
				head: z.string().optional().describe("Filter by head user/org and branch"),
				base: z.string().optional().describe("Filter by base branch"),
				sort: z
					.enum(["created", "updated", "popularity", "long-running"])
					.optional()
					.describe("Sort by"),
				direction: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
				per_page: z.number().max(100).optional().describe("Results per page (max 100)"),
				page: z.number().optional().describe("Page number"),
			},
			async ({ owner, repo, state, head, base, sort, direction, per_page, page }) => {
				try {
					const result = await octokit.rest.pulls.list({
						owner,
						repo,
						...(state && { state }),
						...(head && { head }),
						...(base && { base }),
						...(sort && { sort }),
						...(direction && { direction }),
						...(per_page && { per_page }),
						...(page && { page }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 15: Get pull request details
		 */
		this.server.tool(
			"get_pull_request",
			"Get details of a specific pull request",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pull_number: z.number().describe("Pull request number"),
			},
			async ({ owner, repo, pull_number }) => {
				try {
					const result = await octokit.rest.pulls.get({
						owner,
						repo,
						pull_number,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 16: Merge a pull request
		 */
		this.server.tool(
			"merge_pull_request",
			"Merge a pull request",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pull_number: z.number().describe("Pull request number"),
				commit_title: z.string().optional().describe("Title for merge commit"),
				commit_message: z.string().optional().describe("Extra detail for merge commit"),
				merge_method: z
					.enum(["merge", "squash", "rebase"])
					.optional()
					.describe("Merge method"),
			},
			async ({ owner, repo, pull_number, commit_title, commit_message, merge_method }) => {
				try {
					const result = await octokit.rest.pulls.merge({
						owner,
						repo,
						pull_number,
						...(commit_title && { commit_title }),
						...(commit_message && { commit_message }),
						...(merge_method && { merge_method }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 17: Create a pull request review
		 */
		this.server.tool(
			"create_pull_request_review",
			"Create a review on a pull request",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pull_number: z.number().describe("Pull request number"),
				body: z.string().describe("Review comment text"),
				event: z
					.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"])
					.describe("Review action"),
				commit_id: z.string().optional().describe("SHA of commit to review"),
				comments: z
					.array(
						z.object({
							path: z.string(),
							position: z.number(),
							body: z.string(),
						})
					)
					.optional()
					.describe("Line-specific comments"),
			},
			async ({ owner, repo, pull_number, body, event, commit_id, comments }) => {
				try {
					const result = await octokit.rest.pulls.createReview({
						owner,
						repo,
						pull_number,
						body,
						event,
						...(commit_id && { commit_id }),
						...(comments && { comments }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 18: Get pull request files
		 */
		this.server.tool(
			"get_pull_request_files",
			"Get the list of files changed in a pull request",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pull_number: z.number().describe("Pull request number"),
			},
			async ({ owner, repo, pull_number }) => {
				try {
					const result = await octokit.rest.pulls.listFiles({
						owner,
						repo,
						pull_number,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 19: Get pull request status
		 */
		this.server.tool(
			"get_pull_request_status",
			"Get the combined status of all status checks for a pull request",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pull_number: z.number().describe("Pull request number"),
			},
			async ({ owner, repo, pull_number }) => {
				try {
					const pr = await octokit.rest.pulls.get({
						owner,
						repo,
						pull_number,
					});

					const result = await octokit.rest.repos.getCombinedStatusForRef({
						owner,
						repo,
						ref: pr.data.head.sha,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 20: Update pull request branch
		 */
		this.server.tool(
			"update_pull_request_branch",
			"Update a pull request branch with the latest changes from the base branch",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pull_number: z.number().describe("Pull request number"),
				expected_head_sha: z
					.string()
					.optional()
					.describe("The expected SHA of the pull request's HEAD ref"),
			},
			async ({ owner, repo, pull_number, expected_head_sha }) => {
				try {
					await octokit.rest.pulls.updateBranch({
						owner,
						repo,
						pull_number,
						...(expected_head_sha && { expected_head_sha }),
					});

					return {
						content: [
							{
								type: "text",
								text: "Pull request branch updated successfully",
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 21: Get pull request comments
		 */
		this.server.tool(
			"get_pull_request_comments",
			"Get the review comments on a pull request",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pull_number: z.number().describe("Pull request number"),
			},
			async ({ owner, repo, pull_number }) => {
				try {
					const result = await octokit.rest.pulls.listReviewComments({
						owner,
						repo,
						pull_number,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 22: Get pull request reviews
		 */
		this.server.tool(
			"get_pull_request_reviews",
			"Get the reviews on a pull request",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pull_number: z.number().describe("Pull request number"),
			},
			async ({ owner, repo, pull_number }) => {
				try {
					const result = await octokit.rest.pulls.listReviews({
						owner,
						repo,
						pull_number,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		// ==================== SEARCH OPERATIONS ====================

		/**
		 * Tool 23: Search code across GitHub
		 */
		this.server.tool(
			"search_code",
			"Search for code across GitHub repositories",
			{
				q: z.string().describe("Search query using GitHub code search syntax"),
				sort: z.enum(["indexed"]).optional().describe("Sort field"),
				order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
				per_page: z.number().max(100).optional().describe("Results per page (max 100)"),
				page: z.number().optional().describe("Page number"),
			},
			async ({ q, sort, order, per_page, page }) => {
				try {
					const result = await octokit.rest.search.code({
						q,
						...(sort && { sort }),
						...(order && { order }),
						...(per_page && { per_page }),
						...(page && { page }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 24: Search issues and pull requests
		 */
		this.server.tool(
			"search_issues",
			"Search for issues and pull requests",
			{
				q: z.string().describe("Search query using GitHub issues search syntax"),
				sort: z
					.enum(["comments", "reactions", "created", "updated"])
					.optional()
					.describe("Sort field"),
				order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
				per_page: z.number().max(100).optional().describe("Results per page (max 100)"),
				page: z.number().optional().describe("Page number"),
			},
			async ({ q, sort, order, per_page, page }) => {
				try {
					const result = await octokit.rest.search.issuesAndPullRequests({
						q,
						...(sort && { sort }),
						...(order && { order }),
						...(per_page && { per_page }),
						...(page && { page }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		/**
		 * Tool 25: Search users
		 */
		this.server.tool(
			"search_users",
			"Search for GitHub users",
			{
				q: z.string().describe("Search query using GitHub users search syntax"),
				sort: z
					.enum(["followers", "repositories", "joined"])
					.optional()
					.describe("Sort field"),
				order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
				per_page: z.number().max(100).optional().describe("Results per page (max 100)"),
				page: z.number().optional().describe("Page number"),
			},
			async ({ q, sort, order, per_page, page }) => {
				try {
					const result = await octokit.rest.search.users({
						q,
						...(sort && { sort }),
						...(order && { order }),
						...(per_page && { per_page }),
						...(page && { page }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);

		// ==================== COMMIT OPERATIONS ====================

		/**
		 * Tool 26: List commits
		 */
		this.server.tool(
			"list_commits",
			"Get commits of a branch in a repository",
			{
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				sha: z.string().optional().describe("Branch name or commit SHA"),
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Number of records per page"),
			},
			async ({ owner, repo, sha, page, per_page }) => {
				try {
					const result = await octokit.rest.repos.listCommits({
						owner,
						repo,
						...(sha && { sha }),
						...(page && { page }),
						...(per_page && { per_page }),
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result.data, null, 2),
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error.message}`,
							},
						],
						isError: true,
					};
				}
			}
		);
	}
}

export default new OAuthProvider({
	apiHandler: GitHubMCP.serve("/mcp"),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",
});
