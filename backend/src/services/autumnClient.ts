/**
 * Autumn API Client
 * Documentation: https://docs.useautumn.com/
 */

const AUTUMN_API_KEY = process.env.AUTUMN_API_KEY || '';
const AUTUMN_API_URL = process.env.AUTUMN_API_URL || 'https://api.useautumn.com';

export interface AttachResponse {
    checkoutUrl?: string;
    success: boolean;
    message?: string;
}

export interface CheckResponse {
    allowed: boolean;
    remaining?: number;
    limit?: number;
    message?: string;
}

export interface TrackResponse {
    success: boolean;
    message?: string;
}

class AutumnClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string, baseUrl: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    /**
     * /attach - Returns a Stripe Checkout URL or handles upgrade/downgrade
     */
    async attach(params: {
        customerId: string;
        productId: string;
        successUrl?: string;
        cancelUrl?: string;
    }): Promise<AttachResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/attach`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                throw new Error(`Autumn API error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Autumn attach error:', error);
            throw error;
        }
    }

    /**
     * /check - Check if customer has access to a product/feature
     */
    async check(params: {
        customerId: string;
        featureId?: string;
        productId?: string;
    }): Promise<CheckResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                throw new Error(`Autumn API error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Autumn check error:', error);
            throw error;
        }
    }

    /**
     * /track - Record usage event
     */
    async track(params: {
        customerId: string;
        featureId: string;
        value: number;
        timestamp?: string;
    }): Promise<TrackResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                throw new Error(`Autumn API error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Autumn track error:', error);
            throw error;
        }
    }
}

export const autumnClient = new AutumnClient(AUTUMN_API_KEY, AUTUMN_API_URL);
