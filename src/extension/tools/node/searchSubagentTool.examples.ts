/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Example usage of the SearchSubagent tool
 *
 * This file demonstrates how the search subagent can be used from within
 * a chat conversation or another tool.
 */

// Example 1: Finding authentication code
// The subagent will try multiple patterns:
// - grep_search for: "authenticate", "auth", "login", "password", "jwt"
// - file_search for: "*auth*.ts", "**\/auth\/*", "**\/services\/*auth*"
// - Variations: "Authentication", "auth_service", "authService"
const authSearchExample = {
	tool: 'searchSubagent',
	input: {
		query: 'Find all authentication and authorization code in the user service',
		description: 'auth code search'
	}
};

// Example 2: Finding database connection logic
// The subagent will:
// - Search for "connection", "pool", "database", "db"
// - Look for files: "*connection*.ts", "**/database/**", "*pool*"
// - Find symbols: "ConnectionPool", "DatabaseConnection", "createConnection"
const dbSearchExample = {
	tool: 'searchSubagent',
	input: {
		query: 'Locate all database connection and pooling implementation',
		description: 'DB connection code'
	}
};

// Example 3: Finding test files for a feature
// The subagent will:
// - Search in test directories
// - Look for patterns: "*.spec.ts", "*.test.ts", "**/__tests__/**"
// - Search content for "describe", "it", "test"
const testSearchExample = {
	tool: 'searchSubagent',
	input: {
		query: 'Find all test files related to the notification system',
		description: 'notification tests'
	}
};

// Example 4: Finding API endpoint definitions
// The subagent will try:
// - "@Get", "@Post", "router.get", "app.post"
// - "*/routes/*", "*/controllers/*", "*/api/*"
// - Different variations of endpoint definitions
const apiSearchExample = {
	tool: 'searchSubagent',
	input: {
		query: 'Find all REST API endpoint definitions for user management',
		description: 'user API endpoints'
	}
};

// Example 5: Finding configuration files
// The subagent will search for:
// - "config", ".env", "settings"
// - Files: "*.config.js", "*.env*", "config/*.json"
// - Environment variable usage
const configSearchExample = {
	tool: 'searchSubagent',
	input: {
		query: 'Find all configuration files and environment variable definitions',
		description: 'config files'
	}
};

/**
 * How the subagent works internally:
 *
 * 1. Receives the query: "Find authentication code"
 *
 * 2. Generates initial search patterns:
 *    - Function names: authenticate, login, verifyPassword
 *    - Class names: AuthService, Authentication, UserAuth
 *    - File patterns: *auth*.ts, *login*, user-auth*
 *    - Keywords in regex: (auth|login|password|jwt|token)
 *
 * 3. Executes searches in parallel:
 *    - grep_search with pattern "(authenticate|login|verify)"
 *    - file_search with pattern "**\/*auth*.ts"
 *    - search_workspace_symbols for "AuthService"
 *
 * 4. Analyzes results:
 *    - Found: auth.service.ts, user-authentication.ts
 *    - Read files to verify relevance
 *
 * 5. Refines search if needed:
 *    - If too many results: add specificity
 *    - If no results: try alternative patterns (PascalCase, snake_case)
 *    - If partial matches: explore those areas deeper
 *
 * 6. Returns summary:
 *    - Files found: src/auth/auth.service.ts, src/users/authentication.ts
 *    - Key functions: authenticateUser(), validateToken()
 *    - Patterns tried: 8 different search patterns
 *    - Confidence: High (found comprehensive results)
 */

export {
	apiSearchExample, authSearchExample, configSearchExample, dbSearchExample,
	testSearchExample
};

