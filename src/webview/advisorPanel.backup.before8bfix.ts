import * as vscode from 'vscode';
import type { ModelPricing } from '../core/types';
import { TokenLensAnalyzer } from '../core/tokenLensAnalyzer';
 
type AdvisorCommand =
	| 'analyze'
	| 'optimize'
	| 'copyOptimized'
	| 'preflight';
 
type AdvisorMessage = {
	command?: AdvisorCommand;
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

					if (message.command === 'preflight') {
						if (!prompt) {
							await this.panel.webview.postMessage({
								type: 'preflightEmpty'
							});
							return;
						}
					
						const result = this.analyzer.preflight(prompt, modelId, outputTokens);
					
						await this.panel.webview.postMessage({
							type: 'preflightResult',
							payload: result
						});
					
						return;
					}
 
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
		.muted { color: var(--vscode-descriptionForeground); }
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
		button:disabled { opacity: 0.55; cursor: not-allowed; }
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
 
		.tabs {
			display: flex;
			gap: 8px;
			margin: 12px 0;
		}
		.tab {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		.tab.active {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		.tab-panel { display: none; }
		.tab-panel.active { display: block; }
 
		.welcome-card {
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 12px;
			margin-bottom: 12px;
			background: var(--vscode-editor-inactiveSelectionBackground);
		}
		.sample-row {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}
		.draft-toolbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin: 12px 0;
		}
		.toggle-row {
			display: flex;
			gap: 8px;
			align-items: center;
		}
		.opportunity-badge {
			display: inline-block;
			margin: 8px 0 12px 0;
			padding: 8px 12px;
			border-radius: 999px;
			font-weight: 700;
			border: 1px solid var(--vscode-panel-border);
		}
		.severity-none {
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
		.severity-low {
			background: rgba(46, 160, 67, 0.18);
			color: var(--vscode-editor-foreground);
		}
		.severity-medium {
			background: rgba(245, 124, 44, 0.22);
			color: var(--vscode-editor-foreground);
		}
		.severity-high {
			background: rgba(218, 54, 51, 0.22);
			color: var(--vscode-editor-foreground);
		}
		.opportunity-panel {
			margin-top: 12px;
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 10px;
		}
		.comparison-panel { margin-top: 12px; }
		.comparison-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 12px;
		}
		.hidden { display: none; }
		.detail-item {
			border-left: 4px solid var(--vscode-button-background);
			padding: 8px;
			margin: 8px 0;
			background: var(--vscode-textCodeBlock-background);
		}
		.change-added {
			background: rgba(46, 160, 67, 0.16);
			padding: 2px 4px;
			border-radius: 4px;
		}
		.change-removed {
			background: rgba(218, 54, 51, 0.16);
			padding: 2px 4px;
			border-radius: 4px;
		}
		.draft-actions { margin-top: 12px; }
		.modal-backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.45);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 9999;
}
 
.modal {
	width: min(760px, 92vw);
	max-height: 82vh;
	overflow: auto;
	border: 1px solid var(--vscode-panel-border);
	border-radius: 10px;
	padding: 16px;
	background: var(--vscode-editor-background);
	color: var(--vscode-editor-foreground);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
 
.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 12px;
}
 
.mini-preview {
	max-height: 220px;
	overflow: auto;
}
 
.risk-low {
	color: var(--vscode-testing-iconPassed);
}
 
.risk-medium {
	color: var(--vscode-editorWarning-foreground);
}
 
.risk-high {
	color: var(--vscode-editorError-foreground);
}
	</style>
</head>
<body>
	<h1>TokenLens Advisor</h1>
	<p class="muted">Preflight prompts before sending to GitHub Copilot or another AI tool.</p>
 
	<div class="tabs">
		<button id="draftTabBtn" class="tab active">Draft Pad</button>
		<button id="advisorTabBtn" class="tab">Advisor</button>
	</div>
 
	<section id="draftTab" class="tab-panel active">
		<div id="welcomeCard" class="welcome-card">
			<h2>Start typing your Copilot prompt</h2>
			<p>TokenLens will analyze cost, token usage, and optimization opportunity automatically.</p>
			<div class="sample-row">
				<button class="samplePrompt" data-sample="codeReview">Use Code Review Sample</button>
				<button class="samplePrompt" data-sample="debugging">Use Debugging Sample</button>
				<button class="samplePrompt" data-sample="sqlData">Use SQL/Data Sample</button>
			</div>
		</div>
 
		<div class="draft-toolbar">
			<label class="toggle-row">
				<input id="liveToggle" type="checkbox" checked />
				<span>Live analysis</span>
			</label>
			<span id="liveState" class="muted">Runs after 800 ms idle typing.</span>
		</div>
 
		<label for="draftPrompt">Draft Prompt</label>
		<textarea id="draftPrompt" placeholder="Type or paste your Copilot prompt here..."></textarea>
 
		<div id="opportunityBadge" class="opportunity-badge severity-none" title="No analysis yet.">
			No opportunity yet
		</div>
 
		<div id="draftCards" class="grid"></div>
 
		<details id="opportunityPanel" class="opportunity-panel">
			<summary>Optimization opportunity details</summary>
 
			<h3>Executive summary</h3>
			<ul id="executiveSummary"></ul>
 
			<h3>Detailed breakdown</h3>
			<div id="detailBreakdown"></div>
		</details>
 
		<div id="comparisonPanel" class="comparison-panel hidden">
			<h2>Before vs Optimized</h2>
			<div class="comparison-grid">
				<div>
					<h3>Original</h3>
					<pre id="originalPreview"></pre>
				</div>
				<div>
					<h3>Optimized</h3>
					<pre id="optimizedPreview"></pre>
				</div>
			</div>
		</div>
 
		<div class="draft-actions">
			<button id="applyOptimizedBtn" disabled>Apply Optimized</button>
			<button id="undoApplyBtn" class="secondary" disabled>Undo</button>
		</div>
 
		<div id="draftStatus" class="status">Ready. Start typing or choose a sample prompt.</div>
		<div id="applyModal" class="modal-backdrop hidden" aria-hidden="true">
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="applyModalTitle">
		<h2 id="applyModalTitle">Apply optimized prompt?</h2>
		<p class="muted">
			TokenLens will replace the Draft Pad text with the optimized prompt, then re-analyze automatically.
		</p>
 
		<div class="grid">
			<div class="card">
				<div>Estimated cost savings</div>
				<div id="applySavingsText" class="big">n/a</div>
			</div>
			<div class="card">
				<div>Token reduction</div>
				<div id="applyTokenReductionText" class="big">n/a</div>
			</div>
			<div class="card">
				<div>Quality risk</div>
				<div id="applyRiskText" class="big">n/a</div>
			</div>
		</div>
 
		<h3>Optimized prompt preview</h3>
		<pre id="applyPreview" class="mini-preview"></pre>
 
		<div class="modal-actions">
			<button id="cancelApplyBtn" class="secondary">Cancel</button>
			<button id="confirmApplyBtn">Apply Optimized</button>
		</div>
	</div>
</div>
	</section>
 
	<section id="advisorTab" class="tab-panel">
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
	</section>
 
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const models = ${modelsJson};
		let latestOptimizedPrompt = '';
		let latestPreflight = null;
		let lastAppliedPrompt = '';
		let debounceTimer = null;
		const debounceMs = 800;
 
		const samples = {
			codeReview: 'Please kindly review this code and provide a very detailed explanation of all issues, risks, edge cases, improvements, and recommendations. I want you to be very thorough and include examples wherever possible. Thank you.',
			debugging: 'Can you help me debug this issue? I am not sure what is happening. Please explain all possible reasons, provide detailed steps, and include examples and alternatives.',
			sqlData: 'Please analyze this SQL query and explain performance issues, indexing recommendations, possible data quality risks, and provide a detailed optimized version with explanation.'
		};
 
		const modelSelect = document.getElementById('model');
		const promptBox = document.getElementById('prompt');
		const outputTokensBox = document.getElementById('outputTokens');
		const result = document.getElementById('result');
		const status = document.getElementById('status');
 
		const draftPrompt = document.getElementById('draftPrompt');
		const liveToggle = document.getElementById('liveToggle');
		const opportunityBadge = document.getElementById('opportunityBadge');
		const opportunityPanel = document.getElementById('opportunityPanel');
		const executiveSummary = document.getElementById('executiveSummary');
		const detailBreakdown = document.getElementById('detailBreakdown');
		const draftCards = document.getElementById('draftCards');
		const originalPreview = document.getElementById('originalPreview');
		const optimizedPreview = document.getElementById('optimizedPreview');
		const comparisonPanel = document.getElementById('comparisonPanel');
		const applyOptimizedBtn = document.getElementById('applyOptimizedBtn');
		const undoApplyBtn = document.getElementById('undoApplyBtn');
		const draftStatus = document.getElementById('draftStatus');
		const applyModal = document.getElementById('applyModal');
		const applySavingsText = document.getElementById('applySavingsText');
		const applyTokenReductionText = document.getElementById('applyTokenReductionText');
		const applyRiskText = document.getElementById('applyRiskText');
		const applyPreview = document.getElementById('applyPreview');
		const confirmApplyBtn = document.getElementById('confirmApplyBtn');
		const cancelApplyBtn = document.getElementById('cancelApplyBtn');
 
		for (const model of models) {
			const option = document.createElement('option');
			option.value = model.id;
			option.textContent = model.displayName + ' (' + model.provider + ')';
			modelSelect.appendChild(option);
		}
 
		document.getElementById('draftTabBtn').addEventListener('click', () => activateTab('draft'));
		document.getElementById('advisorTabBtn').addEventListener('click', () => activateTab('advisor'));
 
		function activateTab(tabName) {
			document.getElementById('draftTabBtn').classList.toggle('active', tabName === 'draft');
			document.getElementById('advisorTabBtn').classList.toggle('active', tabName === 'advisor');
			document.getElementById('draftTab').classList.toggle('active', tabName === 'draft');
			document.getElementById('advisorTab').classList.toggle('active', tabName === 'advisor');
		}
 
		draftPrompt.addEventListener('input', () => {
			if (!liveToggle.checked) {
				setDraftStatus('Live analysis is off.');
				return;
			}
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(runPreflight, debounceMs);
		});
 
		for (const btn of document.querySelectorAll('.samplePrompt')) {
			btn.addEventListener('click', () => {
				const key = btn.getAttribute('data-sample');
				draftPrompt.value = samples[key] || samples.codeReview;
				setDraftStatus('Sample prompt inserted. Running live analysis...');
				runPreflight();
			});
		}
 
		applyOptimizedBtn.addEventListener('click', () => {
	try {
		openApplyModal();
	} catch (error) {
		setDraftStatus('Apply failed: ' + getErrorMessage(error));
		console.error('TokenLens apply open modal failed', error);
	}
});
		function openApplyModal() {
	if (!latestPreflight || !latestPreflight.optimization) {
		setDraftStatus('No optimized prompt available yet. Wait for live analysis to complete.');
		return;
	}
 
	const opt = latestPreflight.optimization;
	const opp = latestPreflight.opportunity || {};
 
	if (!opt.optimizedPrompt || !String(opt.optimizedPrompt).trim()) {
		setDraftStatus('No optimized prompt available to apply.');
		return;
	}
 
	applySavingsText.textContent = Number(opp.costSavingsPct || 0).toFixed(1) + '%';
	applyTokenReductionText.textContent = Number(opp.tokenReductionPct || 0).toFixed(1) + '%';
	applyRiskText.textContent = opt.qualityRisk || 'n/a';
	applyRiskText.className = 'big risk-' + (opt.qualityRisk || 'low');
 
	applyPreview.textContent = opt.optimizedPrompt;
 
	applyModal.classList.remove('hidden');
	applyModal.setAttribute('aria-hidden', 'false');
	setDraftStatus('Review optimized prompt before applying.');
}
 
function closeApplyModal() {
	applyModal.classList.add('hidden');
	applyModal.setAttribute('aria-hidden', 'true');
}
 
function applyLatestOptimizedPrompt() {
	if (!latestPreflight || !latestPreflight.optimization) {
		setDraftStatus('No optimized prompt available to apply.');
		closeApplyModal();
		return;
	}
 
	const optimizedPrompt = latestPreflight.optimization.optimizedPrompt;
 
	if (!optimizedPrompt || !String(optimizedPrompt).trim()) {
		setDraftStatus('Optimized prompt is empty. Nothing was applied.');
		closeApplyModal();
		return;
	}
 
	lastAppliedPrompt = draftPrompt.value;
	draftPrompt.value = optimizedPrompt;
	undoApplyBtn.disabled = false;
 
	closeApplyModal();
	setDraftStatus('Optimized prompt applied. Re-analyzing...');
	runPreflight();
}
 
function getErrorMessage(error) {
	return error && error.message ? error.message : String(error);
}

 
		undoApplyBtn.addEventListener('click', () => {
			if (!lastAppliedPrompt) {
				return;
			}
 
			draftPrompt.value = lastAppliedPrompt;
			lastAppliedPrompt = '';
			undoApplyBtn.disabled = true;
 
			setDraftStatus('Previous prompt restored. Re-analyzing...');
			runPreflight();
		});
 
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
 
			if (message.type === 'preflightResult') {
				latestPreflight = message.payload;
				renderPreflight(message.payload);
				setDraftStatus('Live analysis complete.');
			}
 
			if (message.type === 'preflightEmpty') {
				resetDraftView();
			}
 
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
				setDraftStatus(message.message);
			}
		});
 
		function runPreflight() {
			const prompt = draftPrompt.value.trim();
 
			if (!prompt) {
				resetDraftView();
				return;
			}
 
			setDraftStatus('Analyzing optimization opportunity...');
 
			vscode.postMessage({
				command: 'preflight',
				prompt,
				modelId: modelSelect.value,
				outputTokens: Number(outputTokensBox.value || 500)
			});
		}
 
		function renderPreflight(payload) {
			const opportunity = payload.opportunity;
			const before = payload.before;
			const after = payload.after;
 
			opportunityBadge.textContent = opportunity.badgeText;
			opportunityBadge.title = opportunity.tooltip;
			opportunityBadge.className = 'opportunity-badge severity-' + opportunity.severity;
 
			draftCards.innerHTML =
				card('Before cost', usd(before.costEstimate.totalCostUsd)) +
				card('After cost', usd(after.costEstimate.totalCostUsd)) +
				card('Token reduction', Number(opportunity.tokenReductionPct).toFixed(1) + '%');
 
			renderExecutiveSummary(opportunity.executiveSummary || []);
			renderDetails(opportunity.details || []);
 
			originalPreview.innerHTML = highlightRemoved(payload.originalPrompt, payload.optimization.optimizedPrompt);
			optimizedPreview.innerHTML = highlightAdded(payload.originalPrompt, payload.optimization.optimizedPrompt);
			comparisonPanel.classList.remove('hidden');
 
			applyOptimizedBtn.disabled = !opportunity.hasOpportunity;
 
			if (opportunity.hasOpportunity) {
				opportunityPanel.open = true;
			}
		}
 
		function renderExecutiveSummary(items) {
			executiveSummary.innerHTML = items.map(x => '<li>' + escapeHtml(x) + '</li>').join('');
		}
 
		function renderDetails(details) {
			if (!details.length) {
				detailBreakdown.innerHTML = '<p class="muted">No itemized optimization details available.</p>';
				return;
			}
 
			detailBreakdown.innerHTML = details.map(d =>
				'<div class="detail-item">' +
				'<strong>' + escapeHtml(d.label) + '</strong>' +
				'<p>' + escapeHtml(d.description) + '</p>' +
				'<p><strong>Before:</strong> ' + escapeHtml(String(d.beforeValue ?? 'n/a')) +
				' | <strong>After:</strong> ' + escapeHtml(String(d.afterValue ?? 'n/a')) +
				' | <strong>Delta:</strong> ' + escapeHtml(String(d.delta ?? 'n/a')) + '</p>' +
				'</div>'
			).join('');
		}
 
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
 
		function highlightRemoved(original, optimized) {
			const removed = findDifferentWords(original, optimized);
			let html = escapeHtml(original);
			for (const word of removed.slice(0, 20)) {
				html = html.replace(new RegExp('\\\\b' + escapeRegExp(word) + '\\\\b', 'i'), '<span class="change-removed">' + escapeHtml(word) + '</span>');
			}
			return html;
		}
 
		function highlightAdded(original, optimized) {
			const added = findDifferentWords(optimized, original);
			let html = escapeHtml(optimized);
			for (const word of added.slice(0, 20)) {
				html = html.replace(new RegExp('\\\\b' + escapeRegExp(word) + '\\\\b', 'i'), '<span class="change-added">' + escapeHtml(word) + '</span>');
			}
			return html;
		}
 
		function findDifferentWords(a, b) {
			const aWords = String(a).match(/[A-Za-z0-9_]+/g) || [];
			const bSet = new Set((String(b).match(/[A-Za-z0-9_]+/g) || []).map(x => x.toLowerCase()));
			return aWords.filter(w => !bSet.has(w.toLowerCase()));
		}
 
		function card(title, value) {
			return '<div class="card"><div>' + escapeHtml(title) + '</div><div class="big">' + escapeHtml(String(value)) + '</div></div>';
		}
 
		function setStatus(text, isError) {
			status.textContent = text;
			status.className = isError ? 'status warning' : 'status';
		}
 
		function setDraftStatus(text) {
			draftStatus.textContent = text;
		}
 
		function resetDraftView() {
			latestPreflight = null;
			opportunityBadge.textContent = 'No opportunity yet';
			opportunityBadge.title = 'No analysis yet.';
			opportunityBadge.className = 'opportunity-badge severity-none';
			draftCards.innerHTML = '';
			executiveSummary.innerHTML = '';
			detailBreakdown.innerHTML = '';
			comparisonPanel.classList.add('hidden');
			applyOptimizedBtn.disabled = true;
			setDraftStatus('Ready. Start typing or choose a sample prompt.');
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
 
		function escapeRegExp(value) {
			return String(value)
				.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&')
				.replace(/[{}]/g, '\\\\$&');
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