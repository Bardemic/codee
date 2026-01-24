import { Router } from 'express';

const router = Router();

router.get('/login', (req, res) => {
    res.redirect('http://localhost:5173/');
});

router.get('/callback', async (req, res) => {
    res.redirect('http://localhost:5173/');
});

router.get('/logout', async (req, res) => {
    res.redirect('http://localhost:5173/login');
});

router.get('/session', async (req, res) => {
    return res.json({
        authenticated: true,
        user: {
            id: 'user_mock',
            email: 'mock@example.com',
            firstName: 'Mock',
            lastName: 'User',
        }
    });
});

export const authRouter = router;
