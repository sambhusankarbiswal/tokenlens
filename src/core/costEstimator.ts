import * as fs from 'fs';
import type { CostEstimate, ModelPricing, TokenEstimate } from './types';
 
export class CostEstimator {
	constructor(private readonly pricingRegistry: ModelPricing[]) {}
 
	public static loadPricingRegistry(registryPath: string): ModelPricing[] {
		const raw = fs.readFileSync(registryPath, 'utf8');
		const parsed = JSON.parse(raw);
 
		if (!Array.isArray(parsed)) {
			throw new Error('Pricing registry must be a JSON array.');
		}
 
		for (const item of parsed) {
			CostEstimator.validatePricingItem(item);
		}
 
		return parsed as ModelPricing[];
	}
 
	public getModelPricing(modelId: string): ModelPricing {
		const model = this.pricingRegistry.find((p) => p.id === modelId);
 
		if (model) {
			return model;
		}
 
		if (this.pricingRegistry.length === 0) {
			throw new Error('Pricing registry is empty.');
		}
 
		return this.pricingRegistry[0];
	}
 
	public estimate(tokenEstimate: TokenEstimate, modelPricing: ModelPricing): CostEstimate {
		const inputCostUsd = (tokenEstimate.inputTokens / 1_000_000) * modelPricing.inputUsdPer1M;
		const outputCostUsd =
			(tokenEstimate.estimatedOutputTokens / 1_000_000) * modelPricing.outputUsdPer1M;
 
		return {
			inputCostUsd,
			outputCostUsd,
			totalCostUsd: inputCostUsd + outputCostUsd,
			currency: 'USD',
			pricingSource: modelPricing.source,
			pricingLastUpdated: modelPricing.lastUpdated
		};
	}
 
	private static validatePricingItem(item: Partial<ModelPricing>): void {
		const requiredFields: Array<keyof ModelPricing> = [
			'id',
			'provider',
			'model',
			'displayName',
			'contextWindow',
			'inputUsdPer1M',
			'outputUsdPer1M',
			'source',
			'lastUpdated'
		];
 
		for (const field of requiredFields) {
			if (item[field] === undefined || item[field] === null) {
				throw new Error(`Pricing registry item is missing required field: ${field}`);
			}
		}
	}
}