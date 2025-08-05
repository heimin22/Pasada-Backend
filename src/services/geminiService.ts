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

            return response.text();
        } catch (error) {
            console.error('Error analyzing traffic data:', error);
            throw new Error('Failed to analyze traffic data with Gemini');
        }
    }

    private buildAnalysisPrompt(analytics: Omit<TrafficAnalytics, 'geminiInsights'>): string {
        const { routeName, historicalData, predictions, summary } = analytics;

        return `
        Analyze the following traffic data for route "${routeName}" and provide insights:
  
        HISTORICAL DATA SUMMARY:
        - Average traffic density: ${(summary.averageDensity * 100).toFixed(1)}%
        - Peak traffic hours: ${summary.peakHours.join(', ')}
        - Low traffic hours: ${summary.lowTrafficHours.join(', ')}
        - Weekday vs Weekend density: ${(summary.weekdayVsWeekend.weekday * 100).toFixed(1)}% vs ${(summary.weekdayVsWeekend.weekend * 100).toFixed(1)}%
        - Overall trend: ${summary.trend}
  
        DATA POINTS:
        ${historicalData.slice(-20).map(data => 
          `${data.timestamp.toISOString()}: ${(data.trafficDensity * 100).toFixed(1)}% density`
        ).join('\n')}
  
        PREDICTIONS FOR NEXT WEEK:
        ${predictions.slice(0, 7).map(pred => 
          `${pred.date.toDateString()} ${pred.timeOfDay}: ${(pred.predictedDensity * 100).toFixed(1)}% (confidence: ${(pred.confidence * 100).toFixed(1)}%)`
        ).join('\n')}
  
        Please provide:
        1. Key insights about traffic patterns
        2. Recommendations for optimal travel times
        3. Factors that might be influencing traffic density
        4. Suggestions for route optimization or traffic management
        5. Notable trends or anomalies in the data
  
        Keep the response concise but informative, focusing on actionable insights.
      `;
    }
}