import { registerTokenLensParticipant } from './chat/tokenLensParticipant';
import { TokenLensAnalyzer } from './core/tokenLensAnalyzer';
import { TokenLensAdvisorPanel } from './webview/advisorPanel';
import * as path from 'path';
import * as vscode from 'vscode';
import { CostEstimator } from './core/costEstimator';
import { PromptOptimizer } from './core/promptOptimizer';
import { TokenizationEngine } from './core/tokenizationEngine';
import type {
	ModelPricing,
	PromptAnalysisResult,
	PromptOptimizationAnalysisResult
} from './core/types';
 
const DEFAULT_MODEL_ID = 'openai.gpt-4o-mini';
const DEFAULT_ANALYZE_OUTPUT_TOKENS = 500;
const DEFAULT_OPTIMIZED_OUTPUT_TOKENS = 300;
 
export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('TokenLens');
	context.subscriptions.push(outputChannel);
 
	const registryPath = path.join(context.extensionPath, 'data', 'pricing-registry.json');
	const pricingRegistry = CostEstimator.loadPricingRegistry(registryPath);
 
	const tokenizer = new TokenizationEngine();
	const costEstimator = new CostEstimator(pricingRegistry);
	const promptOptimizer = new PromptOptimizer();
	const analyzer = new TokenLensAnalyzer(costEstimator, tokenizer, promptOptimizer);
	registerTokenLensParticipant(context, analyzer);
 
	outputChannel.appendLine('TokenLens extension activated with modular core engine.');
 
	const analyzeCommand = vscode.commands.registerCommand('tokenlens.analyzePrompt', async () => {
		const prompt = await getPromptFromSelectionOrInput();
		if (!prompt) {
			vscode.window.showWarningMessage('TokenLens: No prompt provided.');
			return;
		}
 
		const analysis = analyzePrompt(prompt, costEstimator, tokenizer);
		writeAnalysisToOutput(outputChannel, prompt, analysis);
 
		const action = await vscode.window.showInformationMessage(
			`TokenLens estimate: ${analysis.tokenEstimate.inputTokens} input tokens, approx ${formatUsd(analysis.costEstimate.totalCostUsd)} total cost.`,
			'Show Details',
			'Open Advisor'
		);
 
		if (action === 'Show Details') {
			outputChannel.show(true);
		}
 
		if (action === 'Open Advisor') {
			await vscode.commands.executeCommand('tokenlens.openAdvisor');
		}
	});
 
	const optimizeCommand = vscode.commands.registerCommand('tokenlens.optimizePrompt', async () => {
		const prompt = await getPromptFromSelectionOrInput();
		if (!prompt) {
			vscode.window.showWarningMessage('TokenLens: No prompt provided.');
			return;
		}
 
		const optimizationAnalysis = optimizePrompt(
			prompt,
			costEstimator,
			tokenizer,
			promptOptimizer
		);
 
		await vscode.env.clipboard.writeText(optimizationAnalysis.optimization.optimizedPrompt);
		writeOptimizationToOutput(outputChannel, optimizationAnalysis);
		outputChannel.show(true);
 
		await vscode.window.showInformationMessage(
			`TokenLens optimized prompt copied to clipboard. Projected savings: ${optimizationAnalysis.savingsPct.toFixed(1)}%.`
		);
	});
 /*
	const openAdvisorCommand = vscode.commands.registerCommand('tokenlens.openAdvisor', () => {
		const defaultPricing = costEstimator.getModelPricing(DEFAULT_MODEL_ID);
 
		const panel = vscode.window.createWebviewPanel(
			'tokenlensAdvisor',
			'TokenLens Advisor',
			vscode.ViewColumn.Beside,
			{
				enableScripts: false
			}
		);
 
		panel.webview.html = getAdvisorHtml(defaultPricing);
	});
 */

	const openAdvisorCommand = vscode.commands.registerCommand('tokenlens.openAdvisor', () => {
	TokenLensAdvisorPanel.show(context, analyzer, pricingRegistry);
});

	context.subscriptions.push(analyzeCommand, optimizeCommand, openAdvisorCommand);
}
 
function analyzePrompt(
	prompt: string,
	costEstimator: CostEstimator,
	tokenizer: TokenizationEngine,
	estimatedOutputTokens = DEFAULT_ANALYZE_OUTPUT_TOKENS
): PromptAnalysisResult {
	const modelPricing = costEstimator.getModelPricing(DEFAULT_MODEL_ID);
	const tokenEstimate = tokenizer.estimate(prompt, modelPricing, estimatedOutputTokens);
	const costEstimate = costEstimator.estimate(tokenEstimate, modelPricing);
 
	return {
		modelPricing,
		tokenEstimate,
		costEstimate
	};
}
 
function optimizePrompt(
	prompt: string,
	costEstimator: CostEstimator,
	tokenizer: TokenizationEngine,
	promptOptimizer: PromptOptimizer
): PromptOptimizationAnalysisResult {
	const optimization = promptOptimizer.optimize(prompt, {
		outputCapWords: DEFAULT_OPTIMIZED_OUTPUT_TOKENS
	});
 
	const before = analyzePrompt(prompt, costEstimator, tokenizer, DEFAULT_ANALYZE_OUTPUT_TOKENS);
	const after = analyzePrompt(
		optimization.optimizedPrompt,
		costEstimator,
		tokenizer,
		DEFAULT_OPTIMIZED_OUTPUT_TOKENS
	);
 
	const savingsUsd = before.costEstimate.totalCostUsd - after.costEstimate.totalCostUsd;
	const savingsPct =
		before.costEstimate.totalCostUsd > 0
			? (savingsUsd / before.costEstimate.totalCostUsd) * 100
			: 0;
 
	return {
		optimization,
		before,
		after,
		savingsUsd,
		savingsPct
	};
}
 
async function getPromptFromSelectionOrInput(): Promise<string | undefined> {
	const editor = vscode.window.activeTextEditor;
	const selectedText = editor?.document.getText(editor.selection)?.trim();
 
	if (selectedText) {
		return selectedText;
	}
 
	const prompt = await vscode.window.showInputBox({
		title: 'TokenLens',
		prompt: 'Paste the prompt you want to analyze or optimize',
		placeHolder: 'Example: Review this code and provide only the top 5 risks...',
		ignoreFocusOut: true
	});
 
	return prompt?.trim();
}

function writeAnalysisToOutput(
	outputChannel: vscode.OutputChannel,
	prompt: string,
	analysis: PromptAnalysisResult
): void {
	const { modelPricing, tokenEstimate, costEstimate } = analysis;
 
	outputChannel.clear();
	outputChannel.appendLine('TokenLens Prompt Analysis');
	outputChannel.appendLine('=========================');
	outputChannel.appendLine('');
	outputChannel.appendLine(`Model: ${modelPricing.displayName}`);
	outputChannel.appendLine(`Provider: ${modelPricing.provider}`);
	outputChannel.appendLine(`Confidence: ${tokenEstimate.confidence}`);
	outputChannel.appendLine(`Tokenizer: ${tokenEstimate.tokenizer}`);
	outputChannel.appendLine('');
	outputChannel.appendLine('Visible prompt estimate');
	outputChannel.appendLine(`- Characters: ${prompt.length}`);
	outputChannel.appendLine(`- Estimated input tokens: ${tokenEstimate.inputTokens}`);
	outputChannel.appendLine(`- Assumed output tokens: ${tokenEstimate.estimatedOutputTokens}`);
	outputChannel.appendLine(`- Total estimated tokens: ${tokenEstimate.totalTokens}`);
	outputChannel.appendLine(`- Context usage: ${formatPct(tokenEstimate.contextUsagePct)}`);
	outputChannel.appendLine('');
	outputChannel.appendLine('Cost estimate');
	outputChannel.appendLine(`- Input cost: ${formatUsd(costEstimate.inputCostUsd)}`);
	outputChannel.appendLine(`- Output cost: ${formatUsd(costEstimate.outputCostUsd)}`);
	outputChannel.appendLine(`- Total cost: ${formatUsd(costEstimate.totalCostUsd)}`);
	outputChannel.appendLine('');
	outputChannel.appendLine('Pricing registry');
	outputChannel.appendLine(`- Source: ${costEstimate.pricingSource}`);
	outputChannel.appendLine(`- Last updated: ${costEstimate.pricingLastUpdated}`);
	outputChannel.appendLine('');
	outputChannel.appendLine('Warnings');
 
	for (const warning of tokenEstimate.warnings) {
		outputChannel.appendLine(`- ${warning}`);
	}
 
	outputChannel.appendLine('');
	outputChannel.appendLine('Next step');
	outputChannel.appendLine('- Run "TokenLens: Optimize Prompt" to preview a shorter prompt and projected savings.');
}
 
function writeOptimizationToOutput(
	outputChannel: vscode.OutputChannel,
	result: PromptOptimizationAnalysisResult
): void {
	outputChannel.clear();
	outputChannel.appendLine('TokenLens Optimization Preview');
	outputChannel.appendLine('================================');
	outputChannel.appendLine('');
	outputChannel.appendLine(`Model: ${result.before.modelPricing.displayName}`);
	outputChannel.appendLine('');
	outputChannel.appendLine('Before');
	outputChannel.appendLine(`- Input tokens: ${result.before.tokenEstimate.inputTokens}`);
	outputChannel.appendLine(`- Estimated output tokens: ${result.before.tokenEstimate.estimatedOutputTokens}`);
	outputChannel.appendLine(`- Estimated cost: ${formatUsd(result.before.costEstimate.totalCostUsd)}`);
	outputChannel.appendLine('');
	outputChannel.appendLine('After');
	outputChannel.appendLine(`- Input tokens: ${result.after.tokenEstimate.inputTokens}`);
	outputChannel.appendLine(`- Estimated output tokens: ${result.after.tokenEstimate.estimatedOutputTokens}`);
	outputChannel.appendLine(`- Estimated cost: ${formatUsd(result.after.costEstimate.totalCostUsd)}`);
	outputChannel.appendLine('');
	outputChannel.appendLine(`Projected savings: ${result.savingsPct.toFixed(1)}% (${formatUsd(result.savingsUsd)})`);
	outputChannel.appendLine(`Quality risk: ${result.optimization.qualityRisk}`);
	outputChannel.appendLine('');
	outputChannel.appendLine('Changes');
 
	if (result.optimization.changes.length === 0) {
		outputChannel.appendLine('- No major simplification rules were applied.');
	} else {
		for (const change of result.optimization.changes) {
			outputChannel.appendLine(`- ${change}`);
		}
	}
 
	outputChannel.appendLine('');
	outputChannel.appendLine('Preserved requirement signals');
 
	if (result.optimization.preservedRequirements.length === 0) {
		outputChannel.appendLine('- None detected.');
	} else {
		for (const requirement of result.optimization.preservedRequirements) {
			outputChannel.appendLine(`- ${requirement}`);
		}
	}
 
	outputChannel.appendLine('');
	outputChannel.appendLine('Optimized prompt copied to clipboard');
	outputChannel.appendLine('------------------------------------');
	outputChannel.appendLine(result.optimization.optimizedPrompt);
 
	if (result.optimization.warnings.length > 0) {
		outputChannel.appendLine('');
		outputChannel.appendLine('Optimizer warnings');
 
		for (const warning of result.optimization.warnings) {
			outputChannel.appendLine(`- ${warning}`);
		}
	}
}
 
function getAdvisorHtml(defaultPricing: ModelPricing): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>TokenLens Advisor</title>
</head>
<body>
	<h1>TokenLens Advisor</h1>
	<p><strong>Status:</strong> Checkpoint 3 modular core engine is connected.</p>
 
	<h2>Default Model</h2>
	<ul>
		<li><strong>Model:</strong> ${escapeHtml(defaultPricing.displayName)}</li>
		<li><strong>Provider:</strong> ${escapeHtml(defaultPricing.provider)}</li>
		<li><strong>Pricing source:</strong> ${escapeHtml(defaultPricing.source)}</li>
	</ul>
 
	<h2>Available MVP Commands</h2>
	<ul>
		<li><strong>TokenLens: Analyze Prompt</strong> — uses TokenizationEngine + CostEstimator.</li>
		<li><strong>TokenLens: Optimize Prompt</strong> — uses PromptOptimizer + before/after savings.</li>
		<li><strong>TokenLens: Open Advisor</strong> — shows current extension status.</li>
	</ul>
 
	<h2>Privacy Note</h2>
	<p>This checkpoint does not store raw prompt text. Analysis is performed locally in the VS Code extension runtime.</p>
 
	<h2>Future Ready</h2>
	<p>The same core modules can be reused by a future <code>@tokenlens</code> GitHub Copilot Chat participant.</p>
</body>
</html>`;
}
 
function formatUsd(value: number): string {
	return `$${value.toFixed(6)}`;
}
 
function formatPct(value: number | undefined): string {
	if (value === undefined || Number.isNaN(value)) {
		return 'n/a';
	}
 
	return `${value.toFixed(2)}%`;
}
 
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
 
export function deactivate() {}

