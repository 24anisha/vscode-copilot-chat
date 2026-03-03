/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { AGENT_FILE_EXTENSION } from '../../../platform/customInstructions/common/promptTypes';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { AgentConfig, buildAgentMarkdown } from './agentTypes';

/**
 * Fallback model priority list for the Search agent.
 * Passed as a YAML array; the runtime picks the first available model.
 */
const SEARCH_AGENT_FALLBACK_MODELS: readonly string[] = [
	'Claude Haiku 4.5 (copilot)',
	'Gemini 3 Flash (Preview) (copilot)',
	'Auto (copilot)',
];

/**
 * Base Search agent configuration.
 *
 * The Search agent is a read-only codebase research subagent that autonomously
 * searches through a repository using multiple strategies, then returns paths
 * and line ranges of relevant code snippets inside a <final_answer> block.
 *
 * This replaces the programmatic SearchSubagentToolCallingLoop approach.
 * Instead of manually managing tool-call rounds via ToolCallingLoop + TSX prompts,
 * the agent is declared here as a plain AgentConfig.  VS Code's agent runtime
 * handles the tool-calling loop automatically; the body field below is the
 * system prompt that would previously have lived in SearchSubagentPrompt.tsx.
 */
const BASE_SEARCH_AGENT_CONFIG: AgentConfig = {
	name: 'Search',
	description: 'Fast read-only codebase exploration and Q&A subagent. Prefer over manually chaining multiple search and file-reading operations to avoid cluttering the main conversation. Safe to call in parallel. Specify thoroughness: quick, medium, or thorough.',
	argumentHint: 'Describe WHAT you\'re looking for and desired thoroughness (quick/medium/thorough)',
	target: 'vscode',
	userInvocable: false,
	agents: [],
	tools: [
		'semantic_search', // Codebase semantic search only (ToolName.Codebase)
		'file_search',     // Find files by glob pattern (ToolName.FindFiles)
		'grep_search',     // Find text in files via regex (ToolName.FindTextInFiles)
		'read_file',       // Read file contents (ToolName.ReadFile)
	],
	body: '', // Generated dynamically in _buildCustomizedConfig
};

/**
 * Provides the Search agent dynamically with settings-based customization.
 */
export class SearchAgentProvider extends Disposable implements vscode.ChatCustomAgentProvider {
	readonly label = vscode.l10n.t('Search Agent');

	private static readonly CACHE_DIR = 'search-agent';
	private static readonly AGENT_FILENAME = `Search${AGENT_FILE_EXTENSION}`;

	private readonly _onDidChangeCustomAgents = this._register(new vscode.EventEmitter<void>());
	readonly onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@ILogService private readonly _logService: ILogService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
	) {
		super();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.Advanced.SearchSubagentModel.fullyQualifiedId) ||
				e.affectsConfiguration(ConfigKey.Advanced.SearchSubagentToolCallLimit.fullyQualifiedId)) {
				this._onDidChangeCustomAgents.fire();
			}
		}));
	}

	async provideCustomAgents(
		_context: unknown,
		_token: vscode.CancellationToken
	): Promise<vscode.ChatResource[]> {
		const config = this._buildCustomizedConfig();
		const content = buildAgentMarkdown(config);
		const fileUri = await this._writeCacheFile(content);
		return [{ uri: fileUri }];
	}

	private async _writeCacheFile(content: string): Promise<vscode.Uri> {
		const cacheDir = vscode.Uri.joinPath(
			this._extensionContext.globalStorageUri,
			SearchAgentProvider.CACHE_DIR
		);

		try {
			await this._fileSystemService.stat(cacheDir);
		} catch {
			await this._fileSystemService.createDirectory(cacheDir);
		}

		const fileUri = vscode.Uri.joinPath(cacheDir, SearchAgentProvider.AGENT_FILENAME);
		await this._fileSystemService.writeFile(fileUri, new TextEncoder().encode(content));
		this._logService.trace(`[SearchAgentProvider] Wrote agent file: ${fileUri.toString()}`);
		return fileUri;
	}

	/**
	 * Message injected as a synthetic user turn on the final tool-call round.
	 *
	 * This is the source of truth for both execution paths:
	 * - ToolCallingLoop path (SearchSubagentToolCallingLoop + SearchSubagentPrompt.tsx):
	 *   SearchSubagentPrompt reads this constant and injects it as a real <UserMessage>
	 *   when the last turn is reached, providing a strong per-turn signal to the model.
	 * - Native .agent.md runtime path: the message is written into the YAML frontmatter
	 *   as `last-turn-message` (via AgentConfig.lastTurnMessage → buildAgentMarkdown)
	 *   so VS Code's runtime can honour it once that field is supported.
	 */
	static readonly LAST_TURN_MESSAGE = 'OK, your allotted iterations are finished -- you must produce a list of code references as the final answer, starting and ending with <final_answer>.';

	/**
	 * Returns the markdown body used as the agent's system prompt.
	 *
	 * Previously this content lived inside SearchSubagentPrompt.tsx as a JSX
	 * <SystemMessage>.  In the .agent.md format the body is just plain markdown
	 * text that VS Code injects as the system message automatically.
	 *
	 * Max turns — previously enforced via ToolCallingLoop.options.toolCallLimit —
	 * is stated plainly here so the model self-regulates on the native runtime path.
	 * The actual last-turn injection is handled separately via LAST_TURN_MESSAGE.
	 */
	static buildAgentBody(maxSearchTurns: number): string {
		return `You are an AI coding research assistant that uses search tools to gather information. You can call tools to search for information and read files across a codebase.

**You have a maximum of ${maxSearchTurns} tool calls.** Plan accordingly — use broad searches first to orient yourself, then narrow with targeted reads.

Once you have thoroughly searched the repository, return a message with ONLY the \`<final_answer>\` tag to provide paths and line ranges of relevant code snippets.

Example:

\`\`\`
<final_answer>
/absolute/path/to/file.py:10-20
/absolute/path/to/another/file.cc:100-120
</final_answer>
\`\`\``;
	}

	private _buildCustomizedConfig(): AgentConfig {
		const coreDefaultModel = this._configurationService.getNonExtensionConfig<string>('chat.searchSubagent.model');
		const extModel = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentModel, this._experimentationService);
		const model: string | readonly string[] = coreDefaultModel || extModel || SEARCH_AGENT_FALLBACK_MODELS;

		const maxSearchTurns = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentToolCallLimit, this._experimentationService);

		return {
			...BASE_SEARCH_AGENT_CONFIG,
			body: SearchAgentProvider.buildAgentBody(maxSearchTurns),
			lastTurnMessage: SearchAgentProvider.LAST_TURN_MESSAGE,
			model,
		};
	}
}
