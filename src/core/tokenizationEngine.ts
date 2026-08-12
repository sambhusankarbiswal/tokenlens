import { countTokens } from 'gpt-tokenizer';
import type { EstimateConfidence, ModelPricing, TokenEstimate } from './types';
 
interface TokenCountResult {
	inputTokens: number;
	confidence: EstimateConfidence;
	tokenizer: string;
	warnings: string[];
}
 
export class TokenizationEngine {
	public estimate(
		prompt: string,
		modelPricing: ModelPricing,
		estimatedOutputTokens = 500
	): TokenEstimate {
		const normalizedPrompt = prompt.trim();
 
		const countResult = this.countVisiblePromptTokens(normalizedPrompt, modelPricing);
		const totalTokens = countResult.inputTokens + estimatedOutputTokens;
 
		const contextUsagePct =
			modelPricing.contextWindow > 0
				? (totalTokens / modelPricing.contextWindow) * 100
				: undefined;
 
		const warnings: string[] = [
			...countResult.warnings,
			'Visible prompt estimate only. Hidden system prompts, files, tools, chat history, and Copilot context are not included.'
		];
 
		if (contextUsagePct !== undefined && contextUsagePct > 80) {
			warnings.push('High context-window usage risk. Consider pruning context or splitting the task.');
		}
 
		return {
			provider: modelPricing.provider,
			model: modelPricing.model,
			inputTokens: countResult.inputTokens,
			estimatedOutputTokens,
			totalTokens,
			contextWindow: modelPricing.contextWindow,
			contextUsagePct,
			confidence: countResult.confidence,
			tokenizer: countResult.tokenizer,
			warnings
		};
	}
 
	private countVisiblePromptTokens(prompt: string, modelPricing: ModelPricing): TokenCountResult {
		if (!prompt) {
			return {
				inputTokens: 0,
				confidence: 'heuristic',
				tokenizer: 'none',
				warnings: ['Empty prompt.']
			};
		}
 
		if (this.shouldUseGptTokenizer(modelPricing)) {
			try {
				const inputTokens = countTokens(prompt);
 
				return {
					inputTokens,
					confidence: 'model-estimate',
					tokenizer: 'gpt-tokenizer/o200k_base',
					warnings: [
						'Model-aware local token count used for visible prompt text.',
						'Cost is still an estimate because output length and hidden context are unknown before execution.'
					]
				};
			} catch (error) {
				return this.heuristicCount(
					prompt,
					`gpt-tokenizer failed; fallback heuristic used. Reason: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		}
 
		return this.heuristicCount(
			prompt,
			`No provider-specific tokenizer configured for provider "${modelPricing.provider}".`
		);
	}
 
	private shouldUseGptTokenizer(modelPricing: ModelPricing): boolean {
		const provider = modelPricing.provider.toLowerCase();
		const model = modelPricing.model.toLowerCase();
 
		return (
			provider === 'openai' ||
			provider === 'github-copilot' ||
			model.includes('gpt') ||
			model.includes('4o') ||
			model.includes('o1') ||
			model.includes('o3') ||
			model.includes('o4')
		);
	}
 
	private heuristicCount(prompt: string, reason: string): TokenCountResult {
		const tokenLikeParts = prompt.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
		const wordAndSymbolBased = tokenLikeParts.length;
		const charBased = Math.ceil(prompt.length / 4);
		const inputTokens = Math.max(1, Math.ceil((wordAndSymbolBased + charBased) / 2));
 
		return {
			inputTokens,
			confidence: 'heuristic',
			tokenizer: 'word-symbol-char heuristic',
			warnings: [
				reason,
				'Heuristic count is directional only. Add a provider tokenizer or provider token-count API for stronger confidence.'
			]
		};
	}
}