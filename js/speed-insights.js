// Vercel Speed Insights Initialization
// Using injectSpeedInsights for vanilla HTML/JS projects

// Check if we're in a browser environment
if (typeof window !== 'undefined') {
    // Dynamic import to handle the module loading
    // Try _vercel path first (production), fall back to node_modules (development)
    import('/_vercel/speed-insights/index.mjs')
        .catch(() => import('/node_modules/@vercel/speed-insights/dist/index.mjs'))
        .then(({ injectSpeedInsights }) => {
            // Initialize Speed Insights
            injectSpeedInsights({
                debug: false, // Set to true for development debugging
            });
        })
        .catch((error) => {
            console.warn('Speed Insights failed to load:', error);
        });
}
