import { CostEstimator } from './costEstimator';
import { PromptOptimizer } from './promptOptimizer';
import { TokenizationEngine } from './tokenizationEngine';
import type {
	OptimizationOpportunity,
	OptimizationSeverity,
	PromptAnalysisResult,
	PromptOptimizationAnalysisResult,
	PromptPreflightResult
} from './types';
 
export const DEFAULT_MODEL_ID = 'openai.gpt-4o-mini';
export const DEFAULT_ANALYZE_OUTPUT_TOKENS = 500;
export const DEFAULT_OPTIMIZED_OUTPUT_TOKENS = 300;
 
export class TokenLensAnalyzer {
	constructor(
		private readonly costEstimator: CostEstimator,
		private readonly tokenizer: TokenizationEngine,
		private readonly promptOptimizer: PromptOptimizer
	) {}
 
	public analyze(
		prompt: string,
		modelId = DEFAULT_MODEL_ID,
		estimatedOutputTokens = DEFAULT_ANALYZE_OUTPUT_TOKENS
	): PromptAnalysisResult {
		const modelPricing = this.costEstimator.getModelPricing(modelId);
		const tokenEstimate = this.tokenizer.estimate(prompt, modelPricing, estimatedOutputTokens);
		const costEstimate = this.costEstimator.estimate(tokenEstimate, modelPricing);
 
		return {
			modelPricing,
			tokenEstimate,
			costEstimate
		};
	}
 
	public optimize(
		prompt: string,
		modelId = DEFAULT_MODEL_ID
	): PromptOptimizationAnalysisResult {
		const optimization = this.promptOptimizer.optimize(prompt, {
			outputCapWords: DEFAULT_OPTIMIZED_OUTPUT_TOKENS
		});
 
		const before = this.analyze(prompt, modelId, DEFAULT_ANALYZE_OUTPUT_TOKENS);
		const after = this.analyze(
			optimization.optimizedPrompt,
			modelId,
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
 
	public preflight(
		prompt: string,
		modelId = DEFAULT_MODEL_ID,
		estimatedOutputTokens = DEFAULT_ANALYZE_OUTPUT_TOKENS
	): PromptPreflightResult {
		const before = this.analyze(prompt, modelId, estimatedOutputTokens);
		const optimizationAnalysis = this.optimize(prompt, modelId);
		const after = optimizationAnalysis.after;
 
		const tokenReductionPct =
			before.tokenEstimate.inputTokens > 0
				? ((before.tokenEstimate.inputTokens - after.tokenEstimate.inputTokens) /
						before.tokenEstimate.inputTokens) *
					100
				: 0;
 
		const opportunity = this.buildOpportunity(
			optimizationAnalysis.savingsPct,
			tokenReductionPct,
			optimizationAnalysis.savingsUsd,
			optimizationAnalysis.optimization.qualityRisk,
			optimizationAnalysis.optimization.executiveSummary ?? [],
			optimizationAnalysis.optimization.changeDetails ?? []
		);
 
		return {
			originalPrompt: prompt,
			before,
			after,
			optimization: optimizationAnalysis.optimization,
			opportunity
		};
	}
 
	private buildOpportunity(
		costSavingsPct: number,
		tokenReductionPct: number,
		savingsUsd: number,
		qualityRisk: 'low' | 'medium' | 'high',
		executiveSummary: string[],
		details: OptimizationOpportunity['details']
	): OptimizationOpportunity {
		const effectiveOpportunity = Math.max(costSavingsPct, tokenReductionPct);
		const hasOpportunity = effectiveOpportunity > 0;
 
		const severity = this.getSeverity(effectiveOpportunity);
 
		const badgeText = hasOpportunity
			? `Save ${Math.max(0, costSavingsPct).toFixed(1)}% cost / ${Math.max(0, tokenReductionPct).toFixed(1)}% tokens`
			: 'No savings opportunity';
 
		const tooltip = hasOpportunity
			? 'TokenLens found a prompt optimization opportunity. Review the summary and apply if the optimized prompt preserves your intent.'
			: 'TokenLens did not detect a positive savings opportunity for this prompt.';
 
		return {
			hasOpportunity,
			severity,
			costSavingsPct,
			tokenReductionPct,
			savingsUsd,
			qualityRisk,
			badgeText,
			tooltip,
			executiveSummary,
			details
		};
	}
 
	private getSeverity(valuePct: number): OptimizationSeverity {
		if (valuePct <= 0) {
			return 'none';
		}
 
		if (valuePct >= 25) {
			return 'high';
		}
 
		if (valuePct >= 10) {
			return 'medium';
		}
 
		return 'low';
	}
}