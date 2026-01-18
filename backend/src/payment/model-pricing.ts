// Prices are in MICRODOLLARS (1/1,000,000 of a dollar) per 1 million tokens
export const MICRODOLLARS_PER_DOLLAR = 1_000_000;

export interface ModelPricing {
    inputMicrodollarsPer1MTokens: number;
    outputMicrodollarsPer1MTokens: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
    'gpt-5-mini': {
        inputMicrodollarsPer1MTokens: 2_000_000, // $2.00
        outputMicrodollarsPer1MTokens: 6_000_000, // $6.00
    },
};

export function getModelPricing(modelName: string): ModelPricing {
    const pricing = MODEL_PRICING[modelName];

    if (!pricing) {
        return {
            inputMicrodollarsPer1MTokens: 2_000_000, // $2.00
            outputMicrodollarsPer1MTokens: 6_000_000, // $6.00
        };
        throw new Error(`Unknown model pricing for "${modelName}"`);
    }

    return pricing;
}

export function calculateCostMicrodollars(modelName: string, promptTokens: number, completionTokens: number): number {
    const pricing = getModelPricing(modelName);
    const inputCost = Math.floor((promptTokens * pricing.inputMicrodollarsPer1MTokens) / 1_000_000);
    const outputCost = Math.floor((completionTokens * pricing.outputMicrodollarsPer1MTokens) / 1_000_000);
    return inputCost + outputCost;
}

export function microdollarsToDollars(microdollars: number): number {
    return microdollars / MICRODOLLARS_PER_DOLLAR;
}

export function dollarsToMicrodollars(dollars: number): number {
    return Math.floor(dollars * MICRODOLLARS_PER_DOLLAR);
}
