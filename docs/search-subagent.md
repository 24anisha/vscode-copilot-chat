# Search Subagent Tool

## Overview

The Search Subagent is an intelligent search tool that uses an LLM-powered agent to iteratively generate and execute multiple search patterns to find code and files in a codebase based on natural language queries.

## Architecture

The search subagent consists of three main components:

### 1. SearchSubagentTool (`src/extension/tools/node/searchSubagentTool.ts`)
The tool interface that:
- Takes a natural language query and description
- Creates and invokes the SearchSubagentLoop
- Returns aggregated search results to the parent agent

### 2. SearchSubagentLoop (`src/extension/prompt/node/searchSubagentLoop.ts`)
The tool calling loop that:
- Extends the base `ToolCallingLoop` class
- Provides only search-related tools (FindTextInFiles, FindFiles, ReadFile, etc.)
- Runs up to 15 iterations
- Uses temperature 0 for deterministic behavior

### 3. SearchSubagentPrompt (`src/extension/prompts/node/panel/searchSubagentPrompt.tsx`)
The system prompt that instructs the subagent to:
- Generate diverse search patterns (regex, glob, keywords)
- Consider different naming conventions (camelCase, snake_case, etc.)
- Iteratively refine searches based on results
- Provide a summary of findings

## How It Works

1. **User invokes the tool** with a natural language query like:
   ```
   query: "authentication code in the user service"
   description: "find auth code"
   ```

2. **The subagent analyzes** the query and generates multiple search strategies:
   - Function/class names: `authenticate`, `Authentication`, `auth_user`
   - File patterns: `*auth*.ts`, `**/services/user*`
   - Import statements: `import.*auth`
   - Keywords: "login", "password", "jwt"

3. **Iterative search execution**:
   - Starts with broad searches
   - Refines based on results
   - Tries alternative patterns if no results
   - Explores promising matches more deeply
   - Continues for up to 15 iterations

4. **Returns results** including:
   - What patterns were tried
   - What was found (files, code locations)
   - Confidence in completeness

## Available Tools in Subagent

The subagent has access to:
- `FindTextInFiles` (grep_search): Search code content with regex/literal patterns
- `FindFiles` (file_search): Find files by glob patterns
- `ReadFile`: Read file contents to verify matches
- `ListDirectory`: Explore directory structures
- `SearchWorkspaceSymbols`: Find specific symbols/functions

## Usage Example

From a parent agent or chat:

```typescript
// Tool invocation
{
  tool: "searchSubagent",
  input: {
    query: "Find all database connection pooling code",
    description: "DB pool code"
  }
}
```

The subagent will:
1. Search for "connection pool", "connectionPool", "dbPool"
2. Look for files matching `**/db/*.ts`, `**/database/*.ts`
3. Search for class names like "ConnectionPool", "DatabasePool"
4. Read relevant files to verify
5. Return a summary of all findings

## When to Use

Use the search subagent when:
- You're not sure of exact file names or code patterns
- A single grep/file search won't be sufficient
- You need systematic exploration of multiple search strategies
- The query is ambiguous and requires iterative refinement
- You want the LLM to intelligently adapt search patterns

## When NOT to Use

Don't use the search subagent when:
- You know the exact file path or function name (use ReadFile or SearchWorkspaceSymbols)
- A single keyword search will suffice (use FindTextInFiles)
- The search space is very large and time is critical

## Configuration

- **Tool call limit**: 15 iterations (configurable in SearchSubagentLoop)
- **Temperature**: 0 (deterministic behavior)
- **Available tools**: Search-related tools only (no editing/terminal access)

## Benefits Over Direct Search

1. **Intelligent pattern generation**: LLM considers multiple naming conventions and patterns
2. **Adaptive search**: Refines based on results
3. **Comprehensive coverage**: Tries multiple strategies systematically
4. **Context-aware**: Understands the query semantically
5. **Self-correcting**: Adjusts patterns if initial searches fail

## Implementation Details

- Inherits from `ToolCallingLoop` base class
- Uses `SearchSubagentPrompt` for specialized instructions
- Temperature set to 0 for consistent behavior
- Excluded tools: RunSubagent, CoreManageTodoList (to prevent recursion/bloat)
- Returns text summary of the last assistant response

## Future Enhancements

Potential improvements:
- Add semantic search (Codebase tool) as an option
- Support scoped directory searches
- Add result ranking/prioritization
- Track and report search efficiency metrics
- Support for fuzzy/approximate matching hints
