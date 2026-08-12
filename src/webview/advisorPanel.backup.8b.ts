import * as vscode from 'vscode';
import type { ModelPricing } from '../core/types';
import { TokenLensAnalyzer } from '../core/tokenLensAnalyzer';
 
type AdvisorMessage = {
	command?: string;
	prompt?: string;
	modelId?: string;
	outputTokens?: number;
	text?: string;
};
 
export class TokenLensAdvisorPanel {
	private static currentPanel: TokenLensAdvisorPanel | undefined;
 
	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly analyzer: TokenLensAnalyzer,
		private readonly pricingRegistry: ModelPricing[]
	) {
		this.panel.onDidDispose(() => {
			TokenLensAdvisorPanel.currentPanel = undefined;
		});
	}
 
	public static show(
		context: vscode.ExtensionContext,
		analyzer: TokenLensAnalyzer,
		pricingRegistry: ModelPricing[]
	): void {
		if (TokenLensAdvisorPanel.currentPanel) {
			TokenLensAdvisorPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
			return;
		}
 
		const panel = vscode.window.createWebviewPanel(
			'tokenlensAdvisor',
			'TokenLens Advisor',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);
 
		const advisor = new TokenLensAdvisorPanel(panel, analyzer, pricingRegistry);
		TokenLensAdvisorPanel.currentPanel = advisor;
		advisor.render(context);
	}
 
	private render(context: vscode.ExtensionContext): void {
		this.panel.webview.html = this.getHtml(this.panel.webview);
 
		this.panel.webview.onDidReceiveMessage(
			async (message: AdvisorMessage) => {
				try {
					const prompt = (message.prompt ?? '').trim();
					const modelId = message.modelId || this.pricingRegistry[0]?.id;
					const outputTokens = Number(message.outputTokens || 500);
 
					if (message.command === 'analyze') {
						if (!prompt) {
							await this.panel.webview.postMessage({
								type: 'error',
								message: 'Please enter a prompt before analyzing.'
							});
							return;
						}
 
						const result = this.analyzer.analyze(prompt, modelId, outputTokens);
						await this.panel.webview.postMessage({
							type: 'analysisResult',
							payload: result
						});
						return;
					}
 
					if (message.command === 'optimize') {
						if (!prompt) {
							await this.panel.webview.postMessage({
								type: 'error',
								message: 'Please enter a prompt before optimizing.'
							});
							return;
						}
 
						const result = this.analyzer.optimize(prompt, modelId);
						await this.panel.webview.postMessage({
							type: 'optimizationResult',
							payload: result
						});
						return;
					}
 
					if (message.command === 'copyOptimized') {
						const text = message.text ?? '';
						if (!text.trim()) {
							await this.panel.webview.postMessage({
								type: 'error',
								message: 'No optimized prompt available to copy.'
							});
							return;
						}
 
						await vscode.env.clipboard.writeText(text);
						await this.panel.webview.postMessage({
							type: 'copied',
							message: 'Optimized prompt copied to clipboard.'
						});
					}
				} catch (error) {
					await this.panel.webview.postMessage({
						type: 'error',
						message: error instanceof Error ? error.message : String(error)
					});
				}
			},
			undefined,
			context.subscriptions
		);
	}
 
	private getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();
		const modelsJson = JSON.stringify(
			this.pricingRegistry.map((model) => ({
				id: model.id,
				displayName: model.displayName,
				provider: model.provider,
				model: model.model,
				inputUsdPer1M: model.inputUsdPer1M,
				outputUsdPer1M: model.outputUsdPer1M,
				contextWindow: model.contextWindow,
				source: model.source,
				lastUpdated: model.lastUpdated
			}))
		).replace(/</g, '\\u003c');
 
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>TokenLens Advisor</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-editor-foreground);
			background: var(--vscode-editor-background);
			padding: 16px;
		}
		h1 { margin-top: 0; }
		textarea, select, input {
			width: 100%;
			box-sizing: border-box;
			margin-top: 6px;
			margin-bottom: 12px;
			padding: 8px;
			color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
		}
		textarea { min-height: 150px; resize: vertical; }
		button {
			margin-right: 8px;
			margin-bottom: 8px;
			padding: 8px 12px;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			border: none;
			cursor: pointer;
		}
		button.secondary {
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
		}
		.grid {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 8px;
			margin-top: 12px;
		}
		.card {
			border: 1px solid var(--vscode-panel-border);
			padding: 10px;
			border-radius: 6px;
		}
		.big { font-size: 18px; font-weight: 700; }
		.status { margin-top: 10px; color: var(--vscode-descriptionForeground); }
		pre {
			white-space: pre-wrap;
			padding: 10px;
			border: 1px solid var(--vscode-panel-border);
			background: var(--vscode-textCodeBlock-background);
		}
		.warning { color: var(--vscode-editorWarning-foreground); }
	</style>
</head>
<body>
	<h1>TokenLens Advisor</h1>
	<p>Estimate and optimize prompt cost before sending to GitHub Copilot or another AI tool.</p>
 
	<label for="model">Model</label>
	<select id="model"></select>
 
	<label for="outputTokens">Assumed output tokens</label>
	<input id="outputTokens" type="number" min="50" step="50" value="500" />
 
	<label for="prompt">Prompt</label>
	<textarea id="prompt" placeholder="Paste your Copilot prompt here..."></textarea>
 
	<button id="analyzeBtn">Analyze</button>
	<button id="optimizeBtn">Optimize</button>
	<button id="copyBtn" class="secondary">Copy Optimized</button>
 
	<div id="status" class="status">Ready.</div>
	<div id="result"></div>
 
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const models = ${modelsJson};
		let latestOptimizedPrompt = '';
 
		const modelSelect = document.getElementById('model');
		const promptBox = document.getElementById('prompt');
		const outputTokensBox = document.getElementById('outputTokens');
		const result = document.getElementById('result');
		const status = document.getElementById('status');
 
		for (const model of models) {
			const option = document.createElement('option');
			option.value = model.id;
			option.textContent = model.displayName + ' (' + model.provider + ')';
			modelSelect.appendChild(option);
		}
 
		document.getElementById('analyzeBtn').addEventListener('click', () => {
			setStatus('Analyzing prompt...');
			vscode.postMessage({
				command: 'analyze',
				prompt: promptBox.value,
				modelId: modelSelect.value,
				outputTokens: Number(outputTokensBox.value || 500)
			});
		});
 
		document.getElementById('optimizeBtn').addEventListener('click', () => {
			setStatus('Optimizing prompt...');
			vscode.postMessage({
				command: 'optimize',
				prompt: promptBox.value,
				modelId: modelSelect.value,
				outputTokens: Number(outputTokensBox.value || 500)
			});
		});
 
		document.getElementById('copyBtn').addEventListener('click', () => {
			vscode.postMessage({
				command: 'copyOptimized',
				text: latestOptimizedPrompt
			});
		});
 
		window.addEventListener('message', event => {
			const message = event.data;
 
			if (message.type === 'analysisResult') {
				renderAnalysis(message.payload);
				setStatus('Analysis complete.');
			}
 
			if (message.type === 'optimizationResult') {
				renderOptimization(message.payload);
				setStatus('Optimization complete.');
			}
 
			if (message.type === 'copied') {
				setStatus(message.message);
			}
 
			if (message.type === 'error') {
				setStatus(message.message, true);
			}
		});
 
		function renderAnalysis(payload) {
			const t = payload.tokenEstimate;
			const c = payload.costEstimate;
			const m = payload.modelPricing;
 
			result.innerHTML =
				'<h2>Prompt Analysis</h2>' +
				'<div class="grid">' +
				card('Input tokens', t.inputTokens) +
				card('Output tokens', t.estimatedOutputTokens) +
				card('Estimated cost', usd(c.totalCostUsd)) +
				'</div>' +
				'<p><strong>Model:</strong> ' + escapeHtml(m.displayName) + '</p>' +
				'<p><strong>Confidence:</strong> ' + escapeHtml(t.confidence) + '</p>' +
				'<p><strong>Tokenizer:</strong> ' + escapeHtml(t.tokenizer || 'n/a') + '</p>' +
				'<p><strong>Context usage:</strong> ' + pct(t.contextUsagePct) + '</p>' +
				'<p class="warning">' + escapeHtml((t.warnings || []).join(' ')) + '</p>';
		}
 
		function renderOptimization(payload) {
			const before = payload.before;
			const after = payload.after;
			const opt = payload.optimization;
			latestOptimizedPrompt = opt.optimizedPrompt;
 
			result.innerHTML =
				'<h2>Optimization Preview</h2>' +
				'<div class="grid">' +
				card('Before cost', usd(before.costEstimate.totalCostUsd)) +
				card('After cost', usd(after.costEstimate.totalCostUsd)) +
				card('Savings', Number(payload.savingsPct).toFixed(1) + '%') +
				'</div>' +
				'<p><strong>Quality risk:</strong> ' + escapeHtml(opt.qualityRisk) + '</p>' +
				'<p><strong>Before tokens:</strong> ' + before.tokenEstimate.inputTokens + ' input / ' + before.tokenEstimate.estimatedOutputTokens + ' output</p>' +
				'<p><strong>After tokens:</strong> ' + after.tokenEstimate.inputTokens + ' input / ' + after.tokenEstimate.estimatedOutputTokens + ' output</p>' +
				'<h3>Optimized Prompt</h3>' +
				'<pre>' + escapeHtml(opt.optimizedPrompt) + '</pre>';
		}
 
		function card(title, value) {
			return '<div class="card"><div>' + escapeHtml(title) + '</div><div class="big">' + escapeHtml(String(value)) + '</div></div>';
		}
 
		function setStatus(text, isError) {
			status.textContent = text;
			status.className = isError ? 'status warning' : 'status';
		}
 
		function usd(value) {
			return '$' + Number(value).toFixed(6);
		}
 
		function pct(value) {
			if (value === undefined || value === null || Number.isNaN(Number(value))) {
				return 'n/a';
			}
			return Number(value).toFixed(2) + '%';
		}
 
		function escapeHtml(value) {
			return String(value)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		}
	</script>
</body>
</html>`;
	}
}
 
function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}