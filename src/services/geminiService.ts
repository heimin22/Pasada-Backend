import { GoogleGenerativeAI } from "@google/generative-ai";
import { TrafficAnalytics } from "../types/traffic";

export class GeminiService {
    private genAI: GoogleGenerativeAI;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async analyzeTrafficData(analytics: Omit<TrafficAnalytics, 'geminiInsights'>): Promise<string> {
        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const prompt = this.buildAnalysisPrompt(analytics);
            const result = await model.generateContent(prompt);
            const response = await result.response;

            const text = response.text().trim();
            // Safety: ensure at most two sentences
            const twoSentences = text
              .replace(/\n+/g, ' ')
              .split(/(?<=[.!?])\s+/)
              .slice(0, 2)
              .join(' ');
            return twoSentences;
        } catch (error) {
            console.error('Error analyzing traffic data:', error);
            throw new Error('Failed to analyze traffic data with Gemini');
        }
    }

    private buildAnalysisPrompt(analytics: Omit<TrafficAnalytics, 'geminiInsights'>): string {
        const { routeName, historicalData, predictions, summary } = analytics;

        return `You are generating a user-facing summary for motorists.
Provide exactly two short sentences, direct and plain English, no bullet points.
Mention congestion level briefly and one practical tip, nothing else.

Context for route "${routeName}":
- Avg density: ${(summary.averageDensity * 100).toFixed(0)}%
- Peak hours: ${summary.peakHours.join(', ')}
- Low hours: ${summary.lowTrafficHours.join(', ')}
- Weekday vs Weekend: ${(summary.weekdayVsWeekend.weekday * 100).toFixed(0)}% vs ${(summary.weekdayVsWeekend.weekend * 100).toFixed(0)}%
- Trend: ${summary.trend}

Recent data points:
${historicalData.slice(-10).map(d => `${d.timestamp.toISOString()} ${(d.trafficDensity * 100).toFixed(0)}%`).join('\n')}

Predictions next days:
${predictions.slice(0, 3).map(p => `${p.date.toDateString()} ${p.timeOfDay} ${(p.predictedDensity * 100).toFixed(0)}%`).join('\n')}`;
    }
}