import { auth } from '../auth/auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';

export type Context = {
    req: Request;
    res: Response;
    user: { id: string; email: string } | null;
};

export async function createContext({ req, res }: { req: Request; res: Response }) {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });

    const user = session?.user ?? null;

    return { req, res, user };
}

export type AppContext = Awaited<ReturnType<typeof createContext>>;
