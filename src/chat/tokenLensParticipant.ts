import * as vscode from 'vscode';
import { TokenLensAnalyzer } from '../core/tokenLensAnalyzer';
import type {
	PromptAnalysisResult,
	PromptOptimizationAnalysisResult
} from '../core/types';
 
interface SessionStats {
	analyzeCount: number;
	optimizeCount: number;
	totalEstimatedBeforeUsd: number;
	totalEstimatedAfterUsd: number;
	totalSavingsUsd: number;
}
 
const sessionStats: SessionStats = {
	analyzeCount: 0,
	optimizeCount: 0,
	totalEstimatedBeforeUsd: 0,
	totalEstimatedAfterUsd: 0,
	totalSavingsUsd: 0
};
 
export function registerTokenLensParticipant(
	context: vscode.ExtensionContext,
	analyzer: TokenLensAnalyzer
): void {
	const handler: vscode.ChatRequestHandler = async (
		request,
		_chatContext,
		stream,
		_token
	) => {
		const command = request.command ?? 'analyze';
		const prompt = request.prompt.trim();
 
		stream.progress('TokenLens is analyzing prompt economics locally...');
 
		if (command === 'budget') {
			streamBudgetSummary(stream);
			stream.button({
				command: 'tokenlens.openAdvisor',
				title: 'Open TokenLens Advisor'
			});
			return;
		}
 
		if (!prompt) {
			stream.markdown(
				[
					'### TokenLens needs a prompt',
					'Use one of these examples:',
					'',
					'```text',
					'@tokenlens /analyze Review this code and list only the top 5 risks.',
					'@tokenlens /optimize Please kindly explain this whole file in detail with examples.',
					'@tokenlens /budget',
					'```'
				].join('\n')
			);
			return;
		}
 
		if (command === 'optimize') {
			const result = analyzer.optimize(prompt);
			updateOptimizationStats(result);
			streamOptimizationResult(stream, result);
 
			stream.button({
				command: 'tokenlens.openAdvisor',
				title: 'Open TokenLens Advisor'
			});
			return;
		}
 
		const result = analyzer.analyze(prompt);
		updateAnalyzeStats(result);
		streamAnalysisResult(stream, result);
 
		stream.button({
			command: 'tokenlens.openAdvisor',
			title: 'Open TokenLens Advisor'
		});
	};
 
	const participant = vscode.chat.createChatParticipant('tokenlens.advisor', handler);
	context.subscriptions.push(participant);
}
 
function streamAnalysisResult(
	stream: vscode.ChatResponseStream,
	result: PromptAnalysisResult
): void {
	const { modelPricing, tokenEstimate, costEstimate } = result;
 
	stream.markdown('### TokenLens prompt estimate\n\n');
	stream.markdown(`**Model:** ${modelPricing.displayName}\n\n`);
	stream.markdown(`**Provider:** ${modelPricing.provider}\n\n`);
	stream.markdown(`**Confidence:** ${tokenEstimate.confidence}\n\n`);
	stream.markdown(`**Tokenizer:** ${tokenEstimate.tokenizer}\n\n`);
 
	stream.markdown('| Metric | Value |\n');
	stream.markdown('|---|---:|\n');
	stream.markdown(`| Input tokens | ${tokenEstimate.inputTokens} |\n`);
	stream.markdown(`| Assumed output tokens | ${tokenEstimate.estimatedOutputTokens} |\n`);
	stream.markdown(`| Total estimated tokens | ${tokenEstimate.totalTokens} |\n`);
	stream.markdown(`| Context usage | ${formatPct(tokenEstimate.contextUsagePct)} |\n`);
	stream.markdown(`| Input cost | ${formatUsd(costEstimate.inputCostUsd)} |\n`);
	stream.markdown(`| Output cost | ${formatUsd(costEstimate.outputCostUsd)} |\n`);
	stream.markdown(`| **Total cost** | **${formatUsd(costEstimate.totalCostUsd)}** |\n\n`);
 
	if (tokenEstimate.warnings.length > 0) {
		stream.markdown('#### Warnings\n');
		for (const warning of tokenEstimate.warnings) {
			stream.markdown(`- ${warning}\n`);
		}
		stream.markdown('\n');
	}
 
	stream.markdown('**Next action:** run `@tokenlens /optimize <same prompt>` to preview a shorter, cost-aware version.\n');
}
 
function streamOptimizationResult(
	stream: vscode.ChatResponseStream,
	result: PromptOptimizationAnalysisResult
): void {
	stream.markdown('### TokenLens optimization preview\n\n');
 
	stream.markdown('| Metric | Before | After |\n');
	stream.markdown('|---|---:|---:|\n');
	stream.markdown(
		`| Input tokens | ${result.before.tokenEstimate.inputTokens} | ${result.after.tokenEstimate.inputTokens} |\n`
	);
	stream.markdown(
		`| Assumed output tokens | ${result.before.tokenEstimate.estimatedOutputTokens} | ${result.after.tokenEstimate.estimatedOutputTokens} |\n`
	);
	stream.markdown(
		`| Estimated cost | ${formatUsd(result.before.costEstimate.totalCostUsd)} | ${formatUsd(result.after.costEstimate.totalCostUsd)} |\n\n`
	);
 
	stream.markdown(`**Projected savings:** ${result.savingsPct.toFixed(1)}% (${formatUsd(result.savingsUsd)})\n\n`);
	stream.markdown(`**Quality risk:** ${result.optimization.qualityRisk}\n\n`);
 
	if (result.optimization.changes.length > 0) {
		stream.markdown('#### Changes applied\n');
		for (const change of result.optimization.changes) {
			stream.markdown(`- ${change}\n`);
		}
		stream.markdown('\n');
	}
 
	if (result.optimization.preservedRequirements.length > 0) {
		stream.markdown('#### Preserved requirement signals\n');
		for (const requirement of result.optimization.preservedRequirements) {
			stream.markdown(`- ${requirement}\n`);
		}
		stream.markdown('\n');
	}
 
	stream.markdown('#### Optimized prompt\n');
	stream.markdown('```text\n');
	stream.markdown(result.optimization.optimizedPrompt.replace(/```/g, "'''"));
	stream.markdown('\n```\n\n');
 
	stream.markdown('Copy the optimized prompt from this response or open the TokenLens Advisor for the visual before/after panel.\n');
}
 
function streamBudgetSummary(stream: vscode.ChatResponseStream): void {
	const effectiveAfter =
		sessionStats.totalEstimatedAfterUsd > 0
			? sessionStats.totalEstimatedAfterUsd
			: sessionStats.totalEstimatedBeforeUsd;
 
	const savingsPct =
		sessionStats.totalEstimatedBeforeUsd > 0
			? (sessionStats.totalSavingsUsd / sessionStats.totalEstimatedBeforeUsd) * 100
			: 0;
 
	stream.markdown('### TokenLens local session budget summary\n\n');
	stream.markdown('This MVP stores only aggregate session metrics in memory. It does **not** store raw prompts.\n\n');
 
	stream.markdown('| Metric | Value |\n');
	stream.markdown('|---|---:|\n');
	stream.markdown(`| Analyze requests | ${sessionStats.analyzeCount} |\n`);
	stream.markdown(`| Optimize requests | ${sessionStats.optimizeCount} |\n`);
	stream.markdown(`| Estimated before cost | ${formatUsd(sessionStats.totalEstimatedBeforeUsd)} |\n`);
	stream.markdown(`| Estimated after cost | ${formatUsd(effectiveAfter)} |\n`);
	stream.markdown(`| Estimated savings | ${formatUsd(sessionStats.totalSavingsUsd)} |\n`);
	stream.markdown(`| Estimated savings % | ${savingsPct.toFixed(1)}% |\n\n`);
 
	stream.markdown('Enterprise roadmap: replace this local summary with team budgets, cost-center attribution, and gateway-backed actual usage calibration.\n');
}
 
function updateAnalyzeStats(result: PromptAnalysisResult): void {
	sessionStats.analyzeCount += 1;
	sessionStats.totalEstimatedBeforeUsd += result.costEstimate.totalCostUsd;
}
 
function updateOptimizationStats(result: PromptOptimizationAnalysisResult): void {
	sessionStats.optimizeCount += 1;
	sessionStats.totalEstimatedBeforeUsd += result.before.costEstimate.totalCostUsd;
	sessionStats.totalEstimatedAfterUsd += result.after.costEstimate.totalCostUsd;
	sessionStats.totalSavingsUsd += Math.max(0, result.savingsUsd);
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