// Vercel Speed Insights Initialization
import { injectSpeedInsights } from '../node_modules/@vercel/speed-insights/dist/index.mjs';

// Initialize Speed Insights
injectSpeedInsights({
    debug: false, // Set to true for development debugging
});
