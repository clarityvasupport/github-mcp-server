# GitHub MCP Server - Tools Reference

Complete reference for all 26 GitHub tools available in this MCP server.

## Table of Contents

- [File Operations](#file-operations)
- [Repository Management](#repository-management)
- [Issue Management](#issue-management)
- [Pull Request Management](#pull-request-management)
- [Search Operations](#search-operations)
- [Commit Operations](#commit-operations)

---

## File Operations

### 1. create_or_update_file

Create or update a single file in a repository.

**Parameters:**
```typescript
{
  owner: string;        // Repository owner (username or organization)
  repo: string;         // Repository name
  path: string;         // Path where to create/update the file
  content: string;      // Content of the file
  message: string;      // Commit message
  branch: string;       // Branch to create/update the file in
  sha?: string;         // SHA of file being replaced (for updates)
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "path": "src/app.ts",
  "content": "export const greeting = 'Hello, World!';",
  "message": "Add greeting module",
  "branch": "main"
}
```

**Notes:**
- Automatically creates branch if it doesn't exist
- For updates, provide `sha` to avoid conflicts
- Content is automatically base64 encoded

---

### 2. push_files

Push multiple files in a single commit.

**Parameters:**
```typescript
{
  owner: string;        // Repository owner
  repo: string;         // Repository name
  branch: string;       // Branch to push to
  files: Array<{
    path: string;       // File path
    content: string;    // File content
  }>;
  message: string;      // Commit message
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "branch": "feature/new-ui",
  "files": [
    {
      "path": "src/components/Button.tsx",
      "content": "export const Button = () => <button>Click me</button>;"
    },
    {
      "path": "src/components/Input.tsx",
      "content": "export const Input = () => <input />;"
    }
  ],
  "message": "Add UI components"
}
```

**Notes:**
- More efficient than multiple single-file commits
- All files are committed atomically
- Creates branch if it doesn't exist

---

### 3. get_file_contents

Get contents of a file or directory from a repository.

**Parameters:**
```typescript
{
  owner: string;        // Repository owner
  repo: string;         // Repository name
  path: string;         // Path to file/directory
  branch?: string;      // Branch to get contents from (optional)
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "path": "src/app.ts",
  "branch": "main"
}
```

**Response:**
- For files: Returns content (base64 encoded), SHA, size, etc.
- For directories: Returns array of files and subdirectories

---

## Repository Management

### 4. search_repositories

Search for GitHub repositories.

**Parameters:**
```typescript
{
  query: string;        // Search query
  page?: number;        // Page number for pagination
  perPage?: number;     // Results per page (max 100)
}
```

**Example:**
```typescript
{
  "query": "language:typescript stars:>1000 topic:mcp",
  "perPage": 20
}
```

**Search Query Syntax:**
- `language:typescript` - Filter by language
- `stars:>1000` - Repositories with > 1000 stars
- `forks:>100` - Repositories with > 100 forks
- `topic:ai` - Repositories tagged with topic
- `user:octocat` - Repositories by user
- `org:github` - Repositories by organization
- `created:>2024-01-01` - Created after date
- `pushed:>2024-01-01` - Last push after date
- `is:public` or `is:private` - Visibility

---

### 5. create_repository

Create a new GitHub repository.

**Parameters:**
```typescript
{
  name: string;         // Repository name
  description?: string; // Repository description
  private?: boolean;    // Whether repo should be private
  autoInit?: boolean;   // Initialize with README
}
```

**Example:**
```typescript
{
  "name": "my-new-project",
  "description": "A cool new project",
  "private": false,
  "autoInit": true
}
```

---

### 6. fork_repository

Fork a repository to your account or an organization.

**Parameters:**
```typescript
{
  owner: string;            // Repository owner
  repo: string;             // Repository name
  organization?: string;    // Organization to fork to (optional)
}
```

**Example:**
```typescript
{
  "owner": "original-user",
  "repo": "awesome-project",
  "organization": "my-org"
}
```

---

### 7. create_branch

Create a new branch in a repository.

**Parameters:**
```typescript
{
  owner: string;        // Repository owner
  repo: string;         // Repository name
  branch: string;       // Name for new branch
  from_branch?: string; // Source branch (defaults to repo default)
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "branch": "feature/new-feature",
  "from_branch": "main"
}
```

---

## Issue Management

### 8. create_issue

Create a new issue in a repository.

**Parameters:**
```typescript
{
  owner: string;            // Repository owner
  repo: string;             // Repository name
  title: string;            // Issue title
  body?: string;            // Issue description
  assignees?: string[];     // Usernames to assign
  labels?: string[];        // Labels to add
  milestone?: number;       // Milestone number
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "title": "Bug: App crashes on startup",
  "body": "## Steps to Reproduce\n1. Open app\n2. App crashes\n\n## Expected Behavior\nApp should start normally",
  "labels": ["bug", "priority-high"],
  "assignees": ["octocat"]
}
```

---

### 9. list_issues

List and filter repository issues.

**Parameters:**
```typescript
{
  owner: string;            // Repository owner
  repo: string;             // Repository name
  state?: "open" | "closed" | "all"; // Filter by state
  labels?: string[];        // Filter by labels
  sort?: "created" | "updated" | "comments"; // Sort by
  direction?: "asc" | "desc"; // Sort direction
  since?: string;           // ISO 8601 timestamp
  page?: number;
  per_page?: number;
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "state": "open",
  "labels": ["bug", "high-priority"],
  "sort": "updated",
  "direction": "desc",
  "per_page": 50
}
```

---

### 10. update_issue

Update an existing issue.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  issue_number: number;
  title?: string;           // New title
  body?: string;            // New description
  state?: "open" | "closed"; // New state
  labels?: string[];        // New labels (replaces existing)
  assignees?: string[];     // New assignees (replaces existing)
  milestone?: number;       // New milestone number
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "issue_number": 42,
  "state": "closed",
  "labels": ["bug", "fixed"]
}
```

---

### 11. add_issue_comment

Add a comment to an issue.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  issue_number: number;
  body: string;             // Comment text
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "issue_number": 42,
  "body": "I've fixed this in PR #43"
}
```

---

### 12. get_issue

Get details of a single issue.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  issue_number: number;
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "issue_number": 42
}
```

---

## Pull Request Management

### 13. create_pull_request

Create a new pull request.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  title: string;                // PR title
  body?: string;                // PR description
  head: string;                 // Branch containing changes
  base: string;                 // Branch to merge into
  draft?: boolean;              // Create as draft PR
  maintainer_can_modify?: boolean; // Allow maintainer edits
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "title": "Add new feature",
  "body": "## Changes\n- Added X\n- Fixed Y\n\nCloses #42",
  "head": "feature/awesome",
  "base": "main",
  "draft": false
}
```

---

### 14. list_pull_requests

List and filter repository pull requests.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  head?: string;                // Filter by head branch
  base?: string;                // Filter by base branch
  sort?: "created" | "updated" | "popularity" | "long-running";
  direction?: "asc" | "desc";
  per_page?: number;
  page?: number;
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "state": "open",
  "sort": "updated",
  "direction": "desc"
}
```

---

### 15. get_pull_request

Get details of a specific pull request.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  pull_number: number;
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "pull_number": 1
}
```

---

### 16. merge_pull_request

Merge a pull request.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  pull_number: number;
  commit_title?: string;        // Title for merge commit
  commit_message?: string;      // Extra detail for merge commit
  merge_method?: "merge" | "squash" | "rebase";
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "pull_number": 1,
  "merge_method": "squash",
  "commit_title": "Add awesome feature (#1)"
}
```

---

### 17. create_pull_request_review

Create a review on a pull request.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  pull_number: number;
  body: string;                 // Review comment text
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  commit_id?: string;           // SHA of commit to review
  comments?: Array<{
    path: string;               // File path
    position: number;           // Line position in diff
    body: string;               // Comment text
  }>;
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "pull_number": 1,
  "body": "Looks good to me!",
  "event": "APPROVE"
}
```

---

### 18. get_pull_request_files

Get the list of files changed in a pull request.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  pull_number: number;
}
```

**Response includes:**
- Filename
- Status (added, removed, modified, renamed)
- Additions and deletions count
- Patch (diff)

---

### 19. get_pull_request_status

Get the combined status of all status checks for a pull request.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  pull_number: number;
}
```

**Response includes:**
- Overall state (success, failure, pending)
- Individual check statuses
- Check run details

---

### 20. update_pull_request_branch

Update a pull request branch with the latest changes from the base branch.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  pull_number: number;
  expected_head_sha?: string;   // Expected SHA of PR's HEAD
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "pull_number": 1
}
```

---

### 21. get_pull_request_comments

Get the review comments on a pull request.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  pull_number: number;
}
```

**Response includes:**
- Comment text
- Author
- File path and line number
- Creation date

---

### 22. get_pull_request_reviews

Get the reviews on a pull request.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  pull_number: number;
}
```

**Response includes:**
- Review state (APPROVED, CHANGES_REQUESTED, COMMENTED)
- Reviewer
- Review body
- Submission date

---

## Search Operations

### 23. search_code

Search for code across GitHub repositories.

**Parameters:**
```typescript
{
  q: string;                // Search query
  sort?: "indexed";         // Sort field
  order?: "asc" | "desc";   // Sort order
  per_page?: number;        // Max 100
  page?: number;
}
```

**Example:**
```typescript
{
  "q": "language:typescript fetch in:file path:src/",
  "per_page": 50
}
```

**Query Syntax:**
- `language:typescript` - Search by language
- `repo:owner/name` - Search in specific repo
- `path:src/` - Search in specific path
- `extension:ts` - Search by file extension
- `filename:config` - Search by filename

---

### 24. search_issues

Search for issues and pull requests.

**Parameters:**
```typescript
{
  q: string;                    // Search query
  sort?: "comments" | "reactions" | "created" | "updated";
  order?: "asc" | "desc";
  per_page?: number;
  page?: number;
}
```

**Example:**
```typescript
{
  "q": "is:issue is:open label:bug repo:octocat/Hello-World",
  "sort": "comments",
  "order": "desc"
}
```

**Query Syntax:**
- `is:issue` or `is:pr` - Filter by type
- `is:open` or `is:closed` - Filter by state
- `label:bug` - Search by label
- `author:username` - Search by author
- `assignee:username` - Search by assignee
- `mentions:username` - Mentions user
- `created:>2024-01-01` - Created after date

---

### 25. search_users

Search for GitHub users.

**Parameters:**
```typescript
{
  q: string;                    // Search query
  sort?: "followers" | "repositories" | "joined";
  order?: "asc" | "desc";
  per_page?: number;
  page?: number;
}
```

**Example:**
```typescript
{
  "q": "location:London language:TypeScript followers:>100",
  "sort": "followers",
  "order": "desc"
}
```

**Query Syntax:**
- `type:user` or `type:org` - Filter by type
- `followers:>100` - Followers count
- `location:London` - Search by location
- `language:TypeScript` - Users who code in language
- `created:>2020-01-01` - Joined after date

---

## Commit Operations

### 26. list_commits

Get commits of a branch in a repository.

**Parameters:**
```typescript
{
  owner: string;
  repo: string;
  sha?: string;         // Branch name or commit SHA
  page?: number;
  per_page?: number;
}
```

**Example:**
```typescript
{
  "owner": "octocat",
  "repo": "Hello-World",
  "sha": "main",
  "per_page": 30
}
```

**Response includes:**
- Commit SHA
- Author and committer details
- Commit message
- Parent commits
- File stats

---

## Error Handling

All tools return consistent error responses:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: <error message>"
    }
  ],
  "isError": true
}
```

Common errors:
- **404**: Repository, branch, or resource not found
- **401**: Authentication failed or token expired
- **403**: Insufficient permissions or rate limit exceeded
- **422**: Validation error (invalid parameters)

---

## Rate Limits

GitHub API rate limits apply:

- **Authenticated requests**: 5,000 requests/hour
- **Search API**: 30 requests/minute
- **GraphQL API**: 5,000 points/hour

Check rate limit status:
```bash
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/rate_limit
```

---

## Best Practices

1. **Use specific queries**: Narrow search results with filters
2. **Batch operations**: Use `push_files` instead of multiple `create_or_update_file`
3. **Check status before merge**: Use `get_pull_request_status` before `merge_pull_request`
4. **Handle pagination**: For large result sets, use `page` and `per_page`
5. **Cache results**: Avoid redundant API calls
6. **Respect rate limits**: Implement exponential backoff on errors

---

## Further Reading

- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [GitHub Search Syntax](https://docs.github.com/en/search-github/searching-on-github)
- [Octokit.js Documentation](https://octokit.github.io/rest.js/)
