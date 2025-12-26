import { serve } from 'bun';

const indexHtml = Bun.file('./dist/index.html');

serve({
    port: 5173,
    async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;

        if (pathname.startsWith('/assets/svgs/')) {
            const file = Bun.file(`./src${pathname}`);
            if (await file.exists()) return new Response(file);
        }

        const file = Bun.file(`./dist${pathname}`);
        if (await file.exists()) return new Response(file);

        return new Response(indexHtml);
    },
    development: {
        hmr: true,
    },
});

console.log('Frontend server running at http://localhost:5173');
