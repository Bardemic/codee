import type { Request, Response } from 'express';
import { AppDataSource } from '../db/data-source';
import { OrganizationMember } from '../db/entities/OrganizationMember';

export type Context = {
    req: Request;
    res: Response;
    user: { id: string; email: string } | null;
    organization: { id: number; name: string; workosOrganizationId: string } | null;
};

export async function createContext({ req, res }: { req: Request; res: Response }) {
    // Mock user and organization
    const user = { id: 'user_mock', email: 'mock@example.com' };
    
    // Try to get organization from DB, or create a mock one if needed
    // Actually, it's easier to just return a mock organization
    const organization = { id: 1, name: 'Mock Org', workosOrganizationId: 'org_mock' };

    return { req, res, user, organization };
}

export type AppContext = Awaited<ReturnType<typeof createContext>>;
