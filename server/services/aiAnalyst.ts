import { GoogleGenAI } from "@google/genai";
import type { CryptoPrice } from "./cryptoApi";

// Reference: javascript_gemini blueprint integration
// Note that the newest Gemini model series is "gemini-2.5-flash" or "gemini-2.5-pro"
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  keyPoints: string[];
  recommendation: string;
}

class AIAnalystService {
  async analyzeCrypto(symbol: string, priceData: CryptoPrice): Promise<AnalysisResult> {
    try {
      const prompt = `You are an expert cryptocurrency analyst. Analyze ${symbol} based on this data:

Current Price: $${priceData.price}
24h Change: ${priceData.changePercent24h > 0 ? '+' : ''}${priceData.changePercent24h.toFixed(2)}%
24h Volume: ${priceData.volume24h}
24h High: $${priceData.high24h}
24h Low: $${priceData.low24h}

Provide a concise analysis in JSON format with:
{
  "summary": "2-3 sentence overview of current market situation",
  "sentiment": "bullish" | "bearish" | "neutral",
  "keyPoints": ["3-4 bullet points with specific insights"],
  "recommendation": "Clear action recommendation (buy/hold/sell/wait) with reasoning"
}

Keep it professional, data-driven, and actionable. Focus on price action, volume, and momentum.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
              keyPoints: { type: "array", items: { type: "string" } },
              recommendation: { type: "string" },
            },
            required: ["summary", "sentiment", "keyPoints", "recommendation"],
          },
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const rawJson = response.text;
      if (rawJson) {
        try {
          const analysis: AnalysisResult = JSON.parse(rawJson);
          // Validate the parsed data
          if (analysis.summary && analysis.sentiment && analysis.keyPoints && analysis.recommendation) {
            return analysis;
          }
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
        }
      }
      
      // If parsing fails, use fallback
      throw new Error("Invalid response format");
    } catch (error) {
      console.error(`AI analysis error for ${symbol}:`, error);
      // Fallback analysis
      return this.getFallbackAnalysis(symbol, priceData);
    }
  }

  async compareCoins(symbols: string[], pricesMap: Map<string, CryptoPrice>): Promise<string> {
    try {
      const dataString = Array.from(pricesMap.entries())
        .map(([sym, data]) => `${sym}: $${data.price} (${data.changePercent24h > 0 ? '+' : ''}${data.changePercent24h.toFixed(2)}%)`)
        .join('\n');

      const prompt = `Compare these cryptocurrencies and provide insights:

${dataString}

Give a brief comparison (3-4 sentences) highlighting:
1. Which coin shows strongest momentum
2. Relative performance differences
3. Which might be better positioned short-term

Keep it concise and actionable.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      return response.text || "Unable to generate comparison at this time.";
    } catch (error) {
      console.error('Comparison error:', error);
      return "Unable to compare coins at this time.";
    }
  }

  async predictTrend(symbol: string, priceData: CryptoPrice): Promise<string> {
    try {
      const prompt = `Based on ${symbol} current data:
- Price: $${priceData.price}
- 24h: ${priceData.changePercent24h > 0 ? '+' : ''}${priceData.changePercent24h.toFixed(2)}%
- Volume: ${priceData.volume24h}

Provide a short-term trend prediction (next 24-48 hours) in 2-3 sentences. Consider:
- Current momentum
- Volume trends
- Recent price action

Be specific but acknowledge uncertainty.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      return response.text || "Unable to predict trend at this time.";
    } catch (error) {
      console.error('Prediction error:', error);
      return "Unable to generate prediction at this time.";
    }
  }

  private getFallbackAnalysis(symbol: string, priceData: CryptoPrice): AnalysisResult {
    const isPositive = priceData.changePercent24h >= 0;
    const absChange = Math.abs(priceData.changePercent24h);
    
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (absChange > 5) {
      sentiment = isPositive ? 'bullish' : 'bearish';
    } else if (absChange > 2) {
      sentiment = isPositive ? 'bullish' : 'neutral';
    }

    return {
      summary: `${symbol} is currently trading at $${priceData.price.toFixed(2)} with a ${priceData.changePercent24h.toFixed(2)}% change in the last 24 hours.`,
      sentiment,
      keyPoints: [
        `24h price range: $${priceData.low24h.toFixed(2)} - $${priceData.high24h.toFixed(2)}`,
        `Current momentum is ${isPositive ? 'positive' : 'negative'} with ${absChange.toFixed(2)}% change`,
        `Trading volume indicates ${priceData.volume24h > 100000 ? 'strong' : 'moderate'} market activity`,
      ],
      recommendation: absChange > 5 
        ? `${isPositive ? 'Strong upward' : 'Strong downward'} momentum detected. Monitor closely for potential ${isPositive ? 'continuation' : 'reversal'}.`
        : 'Market showing consolidation. Wait for clearer signals before taking action.',
    };
  }
}

export const aiAnalyst = new AIAnalystService();
