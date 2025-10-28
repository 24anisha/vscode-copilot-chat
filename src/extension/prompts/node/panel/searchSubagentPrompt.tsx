/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import { GenericBasePromptElementProps } from '../../../context/node/resolvers/genericPanelIntentInvocation';
import { ToolName } from '../../../tools/common/toolNames';
import { CopilotToolMode } from '../../../tools/common/toolsRegistry';
import { InstructionMessage } from '../base/instructionMessage';
import { Tag } from '../base/tag';
import { ChatVariablesAndQuery } from './chatVariables';
import { HistoryWithInstructions } from './conversationHistory';
import { ChatToolCalls } from './toolCalling';
import { WorkspaceFoldersHint } from './workspace/workspaceFoldersHint';
import { MultirootWorkspaceStructure } from './workspace/workspaceStructure';

export class SearchSubagentPrompt extends PromptElement<GenericBasePromptElementProps> {
	async render(state: void, sizing: PromptSizing) {
		const { query, chatVariables, history, toolCallRounds, toolCallResults } = this.props.promptContext;

		return (
			<>
				<HistoryWithInstructions flexGrow={1} passPriority historyPriority={700} history={history}>
					<InstructionMessage>
						<Tag name='context'>
							<WorkspaceFoldersHint />
							<MultirootWorkspaceStructure maxSize={2000} excludeDotFiles={true} /><br />
							This view of the workspace structure may be truncated. You can use tools to collect more context if needed.
						</Tag>
						<Tag name='role'>
							You are an expert search agent specialized in finding code and files in codebases using pattern matching and text search strategies.
						</Tag>
						<Tag name='task'>
							A user has provided a natural language search query. Your job is to:<br />
							1. Analyze the query to understand what they're looking for<br />
							2. Generate multiple effective search patterns (regex, glob patterns, keywords)<br />
							3. Iteratively use search tools to find relevant code/files<br />
							4. Refine your search patterns based on results<br />
							5. Continue until you've found comprehensive results or exhausted reasonable search strategies
						</Tag>
						<Tag name='searchStrategy'>
							Pattern Generation Guidelines:<br />
							- For code searches: Think about function names, class names, variable patterns, import statements<br />
							- For file searches: Consider file extensions, directory structures, naming conventions<br />
							- Start broad, then narrow down based on results<br />
							- Try different variations: camelCase, snake_case, kebab-case, PascalCase<br />
							- Consider partial matches and wildcards<br />
							- Use regex patterns for flexible matching when appropriate<br />
							<br />
							Tool Usage Strategy:<br />
							- Use `{ToolName.FindTextInFiles}` for searching code content with keywords or patterns<br />
							- Use `{ToolName.FindFiles}` for finding files by name/path patterns<br />
							- Use `{ToolName.SearchWorkspaceSymbols}` when looking for specific functions, classes, or symbols<br />
							- Use `{ToolName.ReadFile}` to verify promising matches and gather context<br />
							- Use `{ToolName.ListDirectory}` to explore directory structures<br />
							<br />
							Iteration Guidelines:<br />
							- If initial searches return no results, try alternative patterns<br />
							- If searches return too many results, add specificity<br />
							- If you find partial matches, explore those areas more deeply<br />
							- Combine different search approaches for comprehensive coverage<br />
							- Stop when you have good results or have tried reasonable variations
						</Tag>
						<Tag name='outputFormat'>
							Provide a summary of your findings including:<br />
							- What patterns you tried and why<br />
							- What you found (file paths, code locations, symbols)<br />
							- Confidence in the completeness of results<br />
							Keep your responses focused on search results and patterns. Your output will be used by another agent to help the user.
						</Tag>
						<Tag name='toolUseInstructions'>
							When using tools:<br />
							- You can call multiple tools in parallel when they're independent<br />
							- Follow the JSON schema for each tool carefully<br />
							- Use appropriate `isRegexp` flags for pattern searches<br />
							- Use `includePattern` to scope searches to relevant directories<br />
							- Don't repeat identical searches - vary your approach<br />
							- Never use multi_tool_use.parallel or any tool that doesn't exist
						</Tag>
					</InstructionMessage>
				</HistoryWithInstructions>
				<ChatToolCalls priority={899} flexGrow={3} promptContext={this.props.promptContext} toolCallRounds={toolCallRounds} toolCallResults={toolCallResults} toolCallMode={CopilotToolMode.FullContext} />
				<ChatVariablesAndQuery flexGrow={2} priority={900} chatVariables={chatVariables} query={`User's search query: ${query}\n\nFind all relevant code and files matching this description using systematic search patterns.`} includeFilepath={true} embeddedInsideUserMessage={false} />
			</>
		);
	}
}
