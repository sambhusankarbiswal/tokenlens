import type {
	OptimizationChangeDetail,
	OptimizationResult,
	PromptOptimizationOptions,
	QualityRisk
} from './types';
 
export class PromptOptimizer {
	public optimize(prompt: string, options: PromptOptimizationOptions = {}): OptimizationResult {
		const outputCapWords = options.outputCapWords ?? 300;
		const originalPrompt = prompt.trim();
		const preservedRequirements = this.extractPreservedRequirements(originalPrompt);
 
		let optimizedCore = originalPrompt;
		const details: OptimizationChangeDetail[] = [];
 
		const fillerBefore = this.countFillerPhrases(optimizedCore);
		optimizedCore = this.removeFillerPhrases(optimizedCore);
		const fillerAfter = this.countFillerPhrases(optimizedCore);
		if (fillerBefore > fillerAfter) {
			details.push({
				category: 'filler',
				label: 'Removed polite filler phrases',
				beforeValue: fillerBefore,
				afterValue: fillerAfter,
				delta: fillerBefore - fillerAfter,
				description: `Removed ${fillerBefore - fillerAfter} filler phrase(s), such as please/kindly/could you.`
			});
		}
 
		const whitespaceBefore = this.countWhitespaceCharacters(optimizedCore);
		const compacted = optimizedCore.replace(/\s+/g, ' ').trim();
		const whitespaceAfter = this.countWhitespaceCharacters(compacted);
		if (whitespaceBefore > whitespaceAfter) {
			details.push({
				category: 'whitespace',
				label: 'Compressed unnecessary whitespace',
				beforeValue: whitespaceBefore,
				afterValue: whitespaceAfter,
				delta: whitespaceBefore - whitespaceAfter,
				description: `Reduced whitespace characters by ${whitespaceBefore - whitespaceAfter}.`
			});
		}
		optimizedCore = compacted;
 
		const duplicateResult = this.removeDuplicateSentences(optimizedCore);
		if (duplicateResult.removedCount > 0) {
			details.push({
				category: 'duplicate',
				label: 'Removed duplicate/repeated asks',
				beforeValue: duplicateResult.beforeCount,
				afterValue: duplicateResult.afterCount,
				delta: duplicateResult.removedCount,
				description: `Removed ${duplicateResult.removedCount} repeated sentence/request(s).`
			});
		}
		optimizedCore = duplicateResult.text;
 
		const coreReduction = Math.max(0, originalPrompt.length - optimizedCore.length);
		if (coreReduction > 0) {
			details.push({
				category: 'verbosity',
				label: 'Reduced verbose wording',
				beforeValue: originalPrompt.length,
				afterValue: optimizedCore.length,
				delta: coreReduction,
				description: `Reduced prompt core length by ${coreReduction} character(s) before adding structured constraints.`
			});
		}
 
		const optimizedPrompt = [
			`Task: ${optimizedCore}`,
			'',
			'Constraints:',
			'- Preserve all explicit requirements, dates, numbers, names, and exclusions.',
			`- Keep the response under ${outputCapWords} words unless code is required.`,
			'- Use concise bullets or a compact table where possible.',
			'- If information is missing, list assumptions before answering.'
		].join('\n');
 
		details.push({
			category: 'output-cap',
			label: 'Added explicit output cap',
			beforeValue: 0,
			afterValue: outputCapWords,
			delta: outputCapWords,
			description: `Added an output cap of ${outputCapWords} words to reduce output-token risk.`
		});
 
		details.push({
			category: 'structure',
			label: 'Converted prompt into task + constraints format',
			description: 'Made the ask easier for the AI model to follow with explicit task and constraints.'
		});
 
		const qualityRisk = this.assessQualityRisk(originalPrompt, optimizedPrompt, preservedRequirements);
		const warnings: string[] = [];
 
		if (qualityRisk !== 'low') {
			warnings.push('Review optimized prompt before use because important constraints may need manual verification.');
		}
 
		const executiveSummary = this.buildExecutiveSummary(details, qualityRisk);
 
		return {
			originalPrompt,
			optimizedPrompt,
			changes: details.map((d) => d.label),
			changeDetails: details,
			executiveSummary,
			qualityRisk,
			preservedRequirements,
			warnings
		};
	}
 
	private countFillerPhrases(prompt: string): number {
		return (prompt.match(/\b(please|kindly|could you|can you help me|i want you to|i would like you to|thanks|thank you)\b/gi) ?? []).length;
	}
 
	private removeFillerPhrases(prompt: string): string {
		return prompt
			.replace(/\b(please|kindly|could you|can you help me|i want you to|i would like you to)\b/gi, '')
			.replace(/\b(thanks|thank you)\b[.!]?$/gi, '')
			.trim();
	}
 
	private countWhitespaceCharacters(prompt: string): number {
		return (prompt.match(/\s/g) ?? []).length;
	}
 
	private removeDuplicateSentences(prompt: string): {
		text: string;
		beforeCount: number;
		afterCount: number;
		removedCount: number;
	} {
		const sentences = prompt
			.split(/(?<=[.!?])\s+/)
			.map((s) => s.trim())
			.filter(Boolean);
 
		if (sentences.length === 0) {
			return { text: prompt, beforeCount: 0, afterCount: 0, removedCount: 0 };
		}
 
		const seen = new Set<string>();
		const unique: string[] = [];
 
		for (const sentence of sentences) {
			const key = sentence.toLowerCase();
			if (!seen.has(key)) {
				seen.add(key);
				unique.push(sentence);
			}
		}
 
		return {
			text: unique.join(' '),
			beforeCount: sentences.length,
			afterCount: unique.length,
			removedCount: sentences.length - unique.length
		};
	}
 
	private extractPreservedRequirements(prompt: string): string[] {
		const patterns = [
			/\bdo not\b[^.!?]*/gi,
			/\bmust\b[^.!?]*/gi,
			/\bshould\b[^.!?]*/gi,
			/\binclude\b[^.!?]*/gi,
			/\bexclude\b[^.!?]*/gi,
			/\b\d+(\.\d+)?%?\b/g,
			/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g
		];
 
		const results = new Set<string>();
 
		for (const pattern of patterns) {
			for (const match of prompt.match(pattern) ?? []) {
				results.add(match.trim());
			}
		}
 
		return Array.from(results).slice(0, 15);
	}
 
	private assessQualityRisk(
		originalPrompt: string,
		optimizedPrompt: string,
		preservedRequirements: string[]
	): QualityRisk {
		const originalHasNegation = /\b(do not|don't|never|exclude|without)\b/i.test(originalPrompt);
		const optimizedHasNegation = /\b(do not|don't|never|exclude|without)\b/i.test(optimizedPrompt);
 
		if (originalHasNegation && !optimizedHasNegation) {
			return 'high';
		}
 
		if (preservedRequirements.length >= 8) {
			return 'medium';
		}
 
		return 'low';
	}
 
	private buildExecutiveSummary(
		details: OptimizationChangeDetail[],
		qualityRisk: QualityRisk
	): string[] {
		const summary: string[] = [];
 
		if (details.some((d) => d.category === 'filler')) {
			summary.push('Removed low-value polite filler to reduce visible prompt tokens.');
		}
 
		if (details.some((d) => d.category === 'duplicate')) {
			summary.push('Removed repeated asks so the model receives a cleaner instruction.');
		}
 
		if (details.some((d) => d.category === 'output-cap')) {
			summary.push('Added an output cap to reduce output-token cost risk.');
		}
 
		if (details.some((d) => d.category === 'structure')) {
			summary.push('Converted the prompt into a task-and-constraints format for clarity.');
		}
 
		if (qualityRisk !== 'low') {
			summary.push(`Quality risk is ${qualityRisk}; review before applying.`);
		}
 
		return summary.length > 0 ? summary : ['No major optimization opportunity detected.'];
	}
}