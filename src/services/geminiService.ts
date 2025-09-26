import { GoogleGenerativeAI } from "@google/generative-ai";
import { TrafficAnalytics } from "../types/traffic";
import { DatabaseService } from "./databaseService";
import { BookingFrequencyResponse } from "./bookingsAnalyticsService";

export class GeminiService {
    private genAI: GoogleGenerativeAI;
    private databaseService: DatabaseService;

    constructor(apiKey: string, databaseService: DatabaseService) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.databaseService = databaseService;
    }

    async answerQuestion(options: {
        question: string;
        routeId?: number;
        days?: number;
    }): Promise<string> {
        const { question } = options;
        const days = options.days ?? 7;
        try {
            // Build minimal, relevant context from database
            let context: string;
            if (options.routeId) {
                const route = await this.databaseService.getRouteById(options.routeId);
                if (!route) {
                    return `I couldn't find that route in Pasada. Please provide a valid route.`;
                }
                const data = await this.databaseService.getHistoricalTrafficData(options.routeId, days);
                const avg = data.length ? Math.round((data.reduce((s, d) => s + d.trafficDensity, 0) / data.length) * 100) : 0;
                // top 3 peak hours
                const hourly = new Map<number, number[]>();
                for (const d of data) {
                    const h = new Date(d.timestamp).getHours();
                    if (!hourly.has(h)) hourly.set(h, []);
                    hourly.get(h)!.push(d.trafficDensity);
                }
                const top = Array.from(hourly.entries())
                    .map(([h, arr]) => ({ h, m: arr.reduce((s, v) => s + v, 0) / arr.length }))
                    .sort((a, b) => b.m - a.m)
                    .slice(0, 3)
                    .map(x => `${x.h}:00 (${Math.round(x.m * 100)}%)`)
                    .join(', ');
                context = `Route: ${route.route_name} (id=${route.officialroute_id}); Avg density last ${days} days: ${avg}%; Peak hours: ${top || 'n/a'}; Data points: ${data.length}.`;
            } else {
                const routes = await this.databaseService.getAllRoutes();
                const summaries: string[] = [];
                let acc = 0;
                let count = 0;
                for (const r of routes.slice(0, 12)) { // cap to keep prompt small
                    const data = await this.databaseService.getHistoricalTrafficData(r.officialroute_id, days);
                    if (!data.length) continue;
                    const avg = data.reduce((s, d) => s + d.trafficDensity, 0) / data.length;
                    acc += avg; count++;
                    summaries.push(`${r.route_name}: ${Math.round(avg * 100)}% (${data.length})`);
                    if (summaries.length >= 8) break; // cap
                }
                const overall = count ? Math.round((acc / count) * 100) : 0;
                context = `Overview last ${days} days: overall avg density ${overall}%; per-route: ${summaries.join('; ')}.`;
            }

            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const prompt = this.buildQaPrompt(question, context, days);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();
            return text
                .replace(/\n+/g, ' ')
                .split(/(?<=[.!?])\s+/)
                .slice(0, 3)
                .join(' ');
        } catch (error: any) {
            console.error('Error answering question with Gemini:', error);
            if (error.message?.includes('429') || error.status === 429) {
                throw new Error('Gemini API rate limit exceeded. Please try again later.');
            } else if (error.message?.includes('401') || error.status === 401) {
                throw new Error('Gemini API authentication failed. Please check your API key.');
            } else if (error.message?.includes('403') || error.status === 403) {
                throw new Error('Gemini API access forbidden. Please check your API permissions.');
            } else if (error.message?.includes('404') || error.status === 404) {
                throw new Error('Sorry, I couldn\'t analyze the traffic data at the moment. Technical error: **GeminiException** => This exception was thrown because the response has a status code of 404 and RequestOptions.validateStatus was configured to throw for this status code.');
            } else if (error.message?.includes('500') || error.status === 500) {
                throw new Error('Gemini API server error. Please try again later.');
            } else {
                throw new Error(`Failed to answer question with Gemini: ${error.message || 'Unknown error'}`);
            }
        }
    }

    async analyzeOverviewFromDatabase(days: number = 7): Promise<string> {
        try {
            const routes = await this.databaseService.getAllRoutes();
            if (!routes || routes.length === 0) {
                return 'No active routes found in the system. Add routes to generate analytics.';
            }

            // Gather historical data for each route
            const routeAnalytics: Array<{
                routeId: number;
                routeName: string;
                averageDensity: number;
                dataPoints: number;
            }> = [];

            for (const route of routes) {
                const data = await this.databaseService.getHistoricalTrafficData(route.officialroute_id, days);
                if (data.length === 0) continue;
                const avg = data.reduce((s, d) => s + d.trafficDensity, 0) / data.length;
                routeAnalytics.push({
                    routeId: route.officialroute_id,
                    routeName: route.route_name,
                    averageDensity: avg,
                    dataPoints: data.length
                });
            }

            if (routeAnalytics.length === 0) {
                return `No traffic data available in the last ${days} days across all routes.`;
            }

            // Compute overall stats
            const overallAverage = routeAnalytics.reduce((s, r) => s + r.averageDensity, 0) / routeAnalytics.length;
            const sortedByCongestion = [...routeAnalytics].sort((a, b) => b.averageDensity - a.averageDensity);
            const topCongested = sortedByCongestion.slice(0, 3);

            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const prompt = this.buildOverviewAnalysisPrompt(days, overallAverage, topCongested, routeAnalytics.length);
            const result = await model.generateContent(prompt);
            const response = await result.response;

            const text = response.text().trim();
            const twoSentences = text
              .replace(/\n+/g, ' ')
              .split(/(?<=[.!?])\s+/)
              .slice(0, 2)
              .join(' ');
            return twoSentences;
        } catch (error: any) {
            console.error('Error generating overview analytics from database:', error);
            if (error.message?.includes('429') || error.status === 429) {
                throw new Error('Gemini API rate limit exceeded. Please try again later.');
            } else if (error.message?.includes('401') || error.status === 401) {
                throw new Error('Gemini API authentication failed. Please check your API key.');
            } else if (error.message?.includes('403') || error.status === 403) {
                throw new Error('Gemini API access forbidden. Please check your API permissions.');
            } else if (error.message?.includes('404') || error.status === 404) {
                throw new Error('Sorry, I couldn\'t analyze the traffic data at the moment. Technical error: **GeminiException** => This exception was thrown because the response has a status code of 404 and RequestOptions.validateStatus was configured to throw for this status code. The status code of 404 has the following meaning: "Client error - the request contains bad syntax or cannot be fulfilled". Read more about status codes at https://developer.mozilla.org/en-US/docs/Web/HTTP/Status. In order to resolve this exception you typically have either to verify and fix your request code or you have to fix the server code.');
            } else if (error.message?.includes('500') || error.status === 500) {
                throw new Error('Gemini API server error. Please try again later.');
            } else {
                throw new Error(`Failed to generate overview analytics with Gemini: ${error.message || 'Unknown error'}`);
            }
        }
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
        } catch (error: any) {
            console.error('Error analyzing traffic data:', error);
            
            // Provide more specific error messages based on error type
            if (error.message?.includes('429') || error.status === 429) {
                throw new Error('Gemini API rate limit exceeded. Please try again later.');
            } else if (error.message?.includes('401') || error.status === 401) {
                throw new Error('Gemini API authentication failed. Please check your API key.');
            } else if (error.message?.includes('403') || error.status === 403) {
                throw new Error('Gemini API access forbidden. Please check your API permissions.');
            } else if (error.message?.includes('404') || error.status === 404) {
                throw new Error('Sorry, I couldn\'t analyze the traffic data at the moment. Technical error: **GeminiException** => This exception was thrown because the response has a status code of 404 and RequestOptions.validateStatus was configured to throw for this status code. The status code of 404 has the following meaning: "Client error - the request contains bad syntax or cannot be fulfilled". Read more about status codes at https://developer.mozilla.org/en-US/docs/Web/HTTP/Status. In order to resolve this exception you typically have either to verify and fix your request code or you have to fix the server code.');
            } else if (error.message?.includes('500') || error.status === 500) {
                throw new Error('Gemini API server error. Please try again later.');
            } else {
                throw new Error(`Failed to analyze traffic data with Gemini: ${error.message || 'Unknown error'}`);
            }
        }
    }

    async analyzeTrafficDataFromDatabase(routeId: number, days: number = 7): Promise<string> {
        try {
            // Get route information from database
            const route = await this.databaseService.getRouteById(routeId);
            if (!route) {
                throw new Error(`Route with ID ${routeId} not found`);
            }

            // Get historical traffic data from database
            const historicalData = await this.databaseService.getHistoricalTrafficData(routeId, days);
            
            if (historicalData.length === 0) {
                return `No recent traffic data available for ${route.route_name}. Please check back later for traffic insights.`;
            }

            // Calculate basic statistics from database data
            const trafficDensities = historicalData.map(d => d.trafficDensity);
            const averageDensity = trafficDensities.reduce((sum, density) => sum + density, 0) / trafficDensities.length;
            const maxDensity = Math.max(...trafficDensities);
            const minDensity = Math.min(...trafficDensities);

            // Group by hour to find peak times
            const hourlyData = new Map<number, number[]>();
            historicalData.forEach(data => {
                const hour = new Date(data.timestamp).getHours();
                if (!hourlyData.has(hour)) {
                    hourlyData.set(hour, []);
                }
                hourlyData.get(hour)!.push(data.trafficDensity);
            });

            // Find peak hours (hours with highest average density)
            const peakHours = Array.from(hourlyData.entries())
                .map(([hour, densities]) => ({
                    hour,
                    avgDensity: densities.reduce((sum, d) => sum + d, 0) / densities.length
                }))
                .sort((a, b) => b.avgDensity - a.avgDensity)
                .slice(0, 3)
                .map(h => h.hour);

            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const prompt = this.buildDatabaseAnalysisPrompt(route, historicalData, {
                averageDensity,
                maxDensity,
                minDensity,
                peakHours,
                dataPoints: historicalData.length
            });

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
        } catch (error: any) {
            console.error('Error analyzing traffic data from database:', error);
            
            // Provide more specific error messages based on error type
            if (error.message?.includes('429') || error.status === 429) {
                throw new Error('Gemini API rate limit exceeded. Please try again later.');
            } else if (error.message?.includes('401') || error.status === 401) {
                throw new Error('Gemini API authentication failed. Please check your API key.');
            } else if (error.message?.includes('403') || error.status === 403) {
                throw new Error('Gemini API access forbidden. Please check your API permissions.');
            } else if (error.message?.includes('404') || error.status === 404) {
                throw new Error('Sorry, I couldn\'t analyze the traffic data at the moment. Technical error: **GeminiException** => This exception was thrown because the response has a status code of 404 and RequestOptions.validateStatus was configured to throw for this status code. The status code of 404 has the following meaning: "Client error - the request contains bad syntax or cannot be fulfilled". Read more about status codes at https://developer.mozilla.org/en-US/docs/Web/HTTP/Status. In order to resolve this exception you typically have either to verify and fix your request code or you have to fix the server code.');
            } else if (error.message?.includes('500') || error.status === 500) {
                throw new Error('Gemini API server error. Please try again later.');
            } else {
                throw new Error(`Failed to analyze traffic data with Gemini: ${error.message || 'Unknown error'}`);
            }
        }
    }

    private buildDatabaseAnalysisPrompt(route: any, historicalData: any[], stats: {
        averageDensity: number;
        maxDensity: number;
        minDensity: number;
        peakHours: number[];
        dataPoints: number;
    }): string {
        const { averageDensity, maxDensity, minDensity, peakHours, dataPoints } = stats;

        return `You are Manong, a helpful AI assistant for Pasada, a modern jeepney transportation system in the Philippines. Our team is composed of Calvin John Crehencia, Adrian De Guzman, Ethan Andrei Humarang and Fyke Simon Tonel, we are called CAFE Tech. Don't use emoji.

You are focused in Fleet Management System, Modern Jeepney Transportation System in the Philippines, Ride-Hailing, and Traffic Advisory in the Malinta to Novaliches route in the Philippines. You're implemented in the admin website of Pasada: An AI-Powered Ride-Hailing and Fleet Management Platform for Modernized Jeepneys Services with Mobile Integration and RealTime Analytics.

You're role is to be an advisor, providing suggestions based on the data inside the website. Limit your answer in 3 sentences and summarize if necessary. Don't answer other topics, only those mentioned above.

You are generating a user-facing summary for motorists based on real database traffic data.
Provide exactly two short sentences, direct and plain English, no bullet points.
Mention congestion level briefly and one practical tip, nothing else.

Context for route "${route.route_name}" (ID: ${route.officialroute_id}):
- Data points analyzed: ${dataPoints} from the last 7 days
- Average traffic density: ${(averageDensity * 100).toFixed(0)}%
- Peak density: ${(maxDensity * 100).toFixed(0)}%
- Lightest density: ${(minDensity * 100).toFixed(0)}%
- Peak traffic hours: ${peakHours.map(h => `${h}:00`).join(', ')}

Recent traffic data from database:
${historicalData.slice(-10).map(d => `${d.timestamp.toISOString().split('T')[0]} ${d.timestamp.toISOString().split('T')[1].split('.')[0]} - ${(d.trafficDensity * 100).toFixed(0)}% density`).join('\n')}

Route details:
- Start: ${route.start_location}
- End: ${route.end_location}
- Distance: ${route.distance_km}km
- Status: ${route.status}`;
    }

    private buildAnalysisPrompt(analytics: Omit<TrafficAnalytics, 'geminiInsights'>): string {
        const { routeName, historicalData, predictions, summary } = analytics;

        return `You are Manong, a helpful AI assistant for Pasada, a modern jeepney transportation system in the Philippines. Our team is composed of Calvin John Crehencia, Adrian De Guzman, Ethan Andrei Humarang and Fyke Simon Tonel, we are called CAFE Tech. Don't use emoji.

You are focused in Fleet Management System, Modern Jeepney Transportation System in the Philippines, Ride-Hailing, and Traffic Advisory in the Malinta to Novaliches route in the Philippines. You're implemented in the admin website of Pasada: An AI-Powered Ride-Hailing and Fleet Management Platform for Modernized Jeepneys Services with Mobile Integration and RealTime Analytics.

You're role is to be an advisor, providing suggestions based on the data inside the website. Limit your answer in 3 sentences and summarize if necessary. Don't answer other topics, only those mentioned above.

You are generating a user-facing summary for motorists.
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

    private buildQaPrompt(question: string, context: string, days: number): string {
        return `You are Manong, a helpful AI assistant for Pasada, a modern jeepney transportation system in the Philippines. Our team is composed of Calvin John Crehencia, Adrian De Guzman, Ethan Andrei Humarang and Fyke Simon Tonel, we are called CAFE Tech. Don't use emoji.

You are focused in Fleet Management System, Modern Jeepney Transportation System in the Philippines, Ride-Hailing, and Traffic Advisory in the Malinta to Novaliches route in the Philippines. You're implemented in the admin website of Pasada: An AI-Powered Ride-Hailing and Fleet Management Platform for Modernized Jeepneys Services with Mobile Integration and RealTime Analytics.

You're role is to be an advisor, providing suggestions based on the data inside the website. Limit your answer in 3 sentences and summarize if necessary. Don't answer other topics, only those mentioned above. If the user question is outside scope, politely refuse and suggest asking about Pasada analytics, fleet, routes, or traffic.

Question (user): ${question}

Context (from Pasada database, last ${days} days): ${context}

Instructions:
- Use only the provided context and domain knowledge; do not fabricate unknown details.
- Be concise (max 3 sentences), practical, and data-grounded.
- If context is insufficient, say so briefly and request a specific route or timeframe.`;
    }

    async explainBookingFrequency(
        bookingFrequency: BookingFrequencyResponse,
        days: number = 14
    ): Promise<string> {
        try {
            const { history, forecast } = bookingFrequency;
            const total = history.reduce((s, d) => s + d.count, 0);
            const avgPerDay = history.length ? Math.round(total / history.length) : 0;
            const maxDay = history.reduce((a, b) => (a.count >= b.count ? a : b), { date: '', count: 0, dayOfWeek: 0 } as any);
            const minDay = history.reduce((a, b) => (a.count <= b.count ? a : b), { date: '', count: Number.MAX_SAFE_INTEGER, dayOfWeek: 0 } as any);
            const nextWeekTotal = forecast.reduce((s, f) => s + f.predictedCount, 0);
            const highForecast = forecast.reduce((a, b) => (a.predictedCount >= b.predictedCount ? a : b), forecast[0]);
            const lowForecast = forecast.reduce((a, b) => (a.predictedCount <= b.predictedCount ? a : b), forecast[0]);

            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const prompt = `You are Manong, a helpful AI assistant for Pasada, a modern jeepney transportation system in the Philippines. Our team is composed of Calvin John Crehencia, Adrian De Guzman, Ethan Andrei Humarang and Fyke Simon Tonel, we are called CAFE Tech. Don't use emoji.

You are focused in Fleet Management System, Modern Jeepney Transportation System in the Philippines, Ride-Hailing, and Traffic Advisory in the Malinta to Novaliches route in the Philippines. You're implemented in the admin website of Pasada: An AI-Powered Ride-Hailing and Fleet Management Platform for Modernized Jeepneys Services with Mobile Integration and RealTime Analytics.

You're role is to be an advisor, providing suggestions based on the data inside the website. Limit your answer in 3 sentences and summarize if necessary. Don't answer other topics, only those mentioned above.

Provide a concise explanation for recent booking frequency and the near-term forecast based on real Pasada data.
Context (last ${days} days):
- Average daily bookings: ${avgPerDay}
- Highest day: ${maxDay.date || 'n/a'} (${maxDay.count || 0})
- Lowest day: ${minDay.date || 'n/a'} (${minDay.count === Number.MAX_SAFE_INTEGER ? 0 : minDay.count})
- Next 7-day forecast total: ${nextWeekTotal}
- Forecast high: ${highForecast?.date} (${highForecast?.predictedCount})
- Forecast low: ${lowForecast?.date} (${lowForecast?.predictedCount})

Instructions:
- Give operational advice (dispatch planning, promos, off-peak incentives) in one sentence.
- Keep it at most 3 sentences, plain English.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();
            return text
                .replace(/\n+/g, ' ')
                .split(/(?<=[.!?])\s+/)
                .slice(0, 3)
                .join(' ');
        } catch (error: any) {
            console.error('Error explaining booking frequency with Gemini:', error);
            if (error.message?.includes('429') || error.status === 429) {
                throw new Error('Gemini API rate limit exceeded. Please try again later.');
            } else if (error.message?.includes('401') || error.status === 401) {
                throw new Error('Gemini API authentication failed. Please check your API key.');
            } else if (error.message?.includes('403') || error.status === 403) {
                throw new Error('Gemini API access forbidden. Please check your API permissions.');
            } else if (error.message?.includes('404') || error.status === 404) {
                throw new Error('Sorry, I couldn\'t analyze the booking data at the moment due to a 404 from the AI backend.');
            } else if (error.message?.includes('500') || error.status === 500) {
                throw new Error('Gemini API server error. Please try again later.');
            } else {
                throw new Error(`Failed to generate booking frequency explanation: ${error.message || 'Unknown error'}`);
            }
        }
    }

    private buildOverviewAnalysisPrompt(
        days: number,
        overallAverage: number,
        topCongested: Array<{ routeId: number; routeName: string; averageDensity: number; dataPoints: number }>,
        routesAnalyzed: number
    ): string {
        const topList = topCongested
            .map(r => `${r.routeName} (${Math.round(r.averageDensity * 100)}%)`)
            .join(', ');

        return `You are Manong, a helpful AI assistant for Pasada, a modern jeepney transportation system in the Philippines. Our team is composed of Calvin John Crehencia, Adrian De Guzman, Ethan Andrei Humarang and Fyke Simon Tonel, we are called CAFE Tech. Don't use emoji.

You are focused in Fleet Management System, Modern Jeepney Transportation System in the Philippines, Ride-Hailing, and Traffic Advisory in the Malinta to Novaliches route in the Philippines. You're implemented in the admin website of Pasada: An AI-Powered Ride-Hailing and Fleet Management Platform for Modernized Jeepneys Services with Mobile Integration and RealTime Analytics.

You're role is to be an advisor, providing suggestions based on the data inside the website. Limit your answer in 3 sentences and summarize if necessary. Don't answer other topics, only those mentioned above.

Provide a system-wide traffic overview for the last ${days} days using concise language.
Mention overall congestion briefly and a practical fleet or scheduling tip, nothing else.

Context:
- Routes analyzed: ${routesAnalyzed}
- Overall average density: ${Math.round(overallAverage * 100)}%
- Most congested routes: ${topList}`;
    }

    // Conversational chat grounded to database summaries
    async chatWithManong(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, options?: { days?: number }): Promise<string> {
        const days = options?.days ?? 7;
        try {
            // Pull concise, safe summaries from DB
            const [bookings, routes, drivers, dQuotas, aQuotas, admins, vehicles] = await Promise.all([
                this.databaseService.getBookingsSummary(days),
                this.databaseService.getRoutesSummary(),
                this.databaseService.getDriversSummary(),
                this.databaseService.getDriverQuotasSummary(),
                this.databaseService.getAdminQuotasSummary(),
                this.databaseService.getAdminsSummary(),
                this.databaseService.getVehiclesSummary()
            ]);

            const systemPreamble = `You are Manong, a helpful AI assistant for Pasada (Philippines modern jeepney). No emojis. Scope: fleet management, ride-hailing, traffic advisory, bookings, routes, drivers, vehicles, quotas; also general traffic and transportation in the Philippines (high-level, non-political). Be concise (max 3 sentences). Use only provided data; if unsure, say so and request specifics.`;

            const context = `Context (last ${days} days):\n- Active routes: ${routes.activeRoutes} (${routes.routeNames.slice(0,8).join(', ')}${routes.routeNames.length>8?', ...':''})\n- Bookings total: ${bookings.totalBookings}; avg/day: ${bookings.averagePerDay}\n- Drivers: ${drivers.totalDrivers}; Vehicles: ${vehicles.totalVehicles}\n- Quota policies: driver=${dQuotas.quotaPolicies}, admin=${aQuotas.adminQuotaPolicies}\n- Admins: ${admins.totalAdmins}`;

            const userTurns = messages
                .filter(m => m.role === 'user')
                .map(m => m.content)
                .slice(-3) // keep prompt tight
                .join(' ');

            const prompt = `${systemPreamble}\n\n${context}\n\nUser question(s): ${userTurns}\n\nInstructions:\n- Answer only if related to Pasada domain above.\n- If out-of-scope, briefly refuse and suggest a valid topic.\n- Provide one practical, data-aware suggestion.`;

            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim().replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).slice(0,3).join(' ');
        } catch (error: any) {
            console.error('Error in Manong chat:', error);
            if (error.message?.includes('429') || error.status === 429) {
                throw new Error('Gemini API rate limit exceeded. Please try again later.');
            } else if (error.message?.includes('401') || error.status === 401) {
                throw new Error('Gemini API authentication failed. Please check your API key.');
            } else if (error.message?.includes('403') || error.status === 403) {
                throw new Error('Gemini API access forbidden. Please check your API permissions.');
            } else if (error.message?.includes('404') || error.status === 404) {
                throw new Error('Sorry, I couldn\'t process the request due to a 404 from the AI backend.');
            } else if (error.message?.includes('500') || error.status === 500) {
                throw new Error('Gemini API server error. Please try again later.');
            } else {
                throw new Error(`Failed to process chat with Gemini: ${error.message || 'Unknown error'}`);
            }
        }
    }
}