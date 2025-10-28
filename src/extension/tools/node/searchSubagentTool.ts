/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ChatFetchResponseType } from '../../../platform/chat/common/commonTypes';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatPrepareToolInvocationPart, ChatResponseNotebookEditPart, ChatResponseTextEditPart, ExtendedLanguageModelToolResult, LanguageModelTextPart, MarkdownString } from '../../../vscodeTypes';
import { Conversation, Turn } from '../../prompt/common/conversation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { SearchSubagentLoop } from '../../prompt/node/searchSubagentLoop';
import { ToolName } from '../common/toolNames';
import { CopilotToolMode, ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export interface ISearchSubagentParams {
	query: string;
	description: string;
}

class SearchSubagentTool implements ICopilotTool<ISearchSubagentParams> {
	public static readonly toolName = ToolName.SearchSubagent;
	private _inputContext: IBuildPromptContext | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ISearchSubagentParams>, token: vscode.CancellationToken) {
		if (!this._inputContext?.request) {
			throw new Error('Search subagent requires request context');
		}

		const loop = this.instantiationService.createInstance(SearchSubagentLoop, {
			toolCallLimit: 15, // Allow multiple iterations for search refinement
			conversation: new Conversation('', [new Turn('', { type: 'user', message: options.input.query })]),
			request: this._inputContext.request,
			location: this._inputContext.request.location,
			searchQuery: options.input.query,
		});

		// Filter the stream to only show tool invocations as thinking blocks
		const stream = this._inputContext?.stream && ChatResponseStreamImpl.filter(
			this._inputContext.stream,
			part => part instanceof ChatPrepareToolInvocationPart || part instanceof ChatResponseTextEditPart || part instanceof ChatResponseNotebookEditPart
		);

		const loopResult = await loop.run(stream, token);

		// Return the text of the last assistant response from the tool calling loop
		let searchSummary = '';
		if (loopResult.response.type === ChatFetchResponseType.Success) {
			searchSummary = loopResult.toolCallRounds.at(-1)?.response ?? loopResult.round.response ?? '';
		} else {
			searchSummary = `The search subagent request failed with this message:\n${loopResult.response.type}: ${loopResult.response.reason}`;
		}

		const result = new ExtendedLanguageModelToolResult([new LanguageModelTextPart(searchSummary)]);
		return result;
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ISearchSubagentParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const { input } = options;
		try {
			return {
				invocationMessage: new MarkdownString(l10n.t`Searching for: ${input.description}`),
			};
		} catch {
			return;
		}
	}

	async resolveInput(input: ISearchSubagentParams, promptContext: IBuildPromptContext, mode: CopilotToolMode): Promise<ISearchSubagentParams> {
		this._inputContext = promptContext;
		return input;
	}
}

ToolRegistry.registerTool(SearchSubagentTool);
