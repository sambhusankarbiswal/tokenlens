export type Provider =
	| 'openai'
	| 'anthropic'
	| 'google'
	| 'mistral'
	| 'github-copilot'
	| 'unknown';
 
export type EstimateConfidence = 'exact' | 'model-estimate' | 'heuristic';
 
export type QualityRisk = 'low' | 'medium' | 'high';
 
export interface ModelPricing {
	id: string;
	provider: Provider;
	model: string;
	displayName: string;
	contextWindow: number;
	inputUsdPer1M: number;
	outputUsdPer1M: number;
	cachedInputUsdPer1M?: number;
	source: string;
	lastUpdated: string;
	notes?: string;
}
 
export interface TokenEstimate {
	provider: Provider;
	model: string;
	inputTokens: number;
	estimatedOutputTokens: number;
	totalTokens: number;
	contextWindow?: number;
	contextUsagePct?: number;
	confidence: EstimateConfidence;
	tokenizer: string;
	warnings: string[];
}
 
export interface CostEstimate {
	inputCostUsd: number;
	outputCostUsd: number;
	totalCostUsd: number;
	currency: 'USD';
	pricingSource: string;
	pricingLastUpdated: string;
}
 
export interface PromptOptimizationOptions {
	outputCapWords?: number;
}
 
export interface OptimizationResult {
	originalPrompt: string;
	optimizedPrompt: string;
	changes: string[];
	qualityRisk: QualityRisk;
	preservedRequirements: string[];
	warnings: string[];
}
 
export interface PromptAnalysisResult {
	modelPricing: ModelPricing;
	tokenEstimate: TokenEstimate;
	costEstimate: CostEstimate;
}
 
export interface PromptOptimizationAnalysisResult {
	optimization: OptimizationResult;
	before: PromptAnalysisResult;
	after: PromptAnalysisResult;
	savingsUsd: number;
	savingsPct: number;
}

export type OptimizationChangeCategory =
	| 'filler'
	| 'whitespace'
	| 'duplicate'
	| 'verbosity'
	| 'output-cap'
	| 'structure'
	| 'safety';
 
export type OptimizationSeverity = 'none' | 'low' | 'medium' | 'high';
 
export interface OptimizationChangeDetail {
	category: OptimizationChangeCategory;
	label: string;
	beforeValue?: number;
	afterValue?: number;
	delta?: number;
	description: string;
}
 
export interface OptimizationOpportunity {
	hasOpportunity: boolean;
	severity: OptimizationSeverity;
	costSavingsPct: number;
	tokenReductionPct: number;
	savingsUsd: number;
	qualityRisk: QualityRisk;
	badgeText: string;
	tooltip: string;
	executiveSummary: string[];
	details: OptimizationChangeDetail[];
}
 
export interface PromptPreflightResult {
	originalPrompt: string;
	before: PromptAnalysisResult;
	after: PromptAnalysisResult;
	optimization: OptimizationResult;
	opportunity: OptimizationOpportunity;
}
 
/**
 * Interface merge: adds Checkpoint 8 optional metadata to existing OptimizationResult
 * without breaking existing command, Webview, or chat participant code.
 */
export interface OptimizationResult {
	changeDetails?: OptimizationChangeDetail[];
	executiveSummary?: string[];
}