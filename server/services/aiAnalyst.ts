import { GoogleGenAI } from "@google/genai";
import type { CryptoPrice } from "./cryptoApi";

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
      const prompt = `Ти експерт з криптовалютного аналізу. Проаналізуй ${symbol} на основі цих даних:

Поточна ціна: $${priceData.price}
Зміна за 24 год: ${priceData.changePercent24h > 0 ? '+' : ''}${priceData.changePercent24h.toFixed(2)}%
Обсяг за 24 год: ${priceData.volume24h}
Максимум за 24 год: $${priceData.high24h}
Мінімум за 24 год: $${priceData.low24h}

Надай короткий аналіз у форматі JSON з:
{
  "summary": "2-3 речення про поточну ситуацію на ринку",
  "sentiment": "bullish" | "bearish" | "neutral",
  "keyPoints": ["3-4 основні висновки"],
  "recommendation": "Чітка рекомендація (купувати/тримати/продавати/чекати) з поясненням"
}

Залишай текст професійним, орієнтованим на дані та практичним. Зосередься на динаміці ціни, обсягах та трендах.`;

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
          if (analysis.summary && analysis.sentiment && analysis.keyPoints && analysis.recommendation) {
            return analysis;
          }
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
        }
      }

      throw new Error("Invalid response format");
    } catch (error) {
      console.error(`AI analysis error for ${symbol}:`, error);
      return this.getFallbackAnalysis(symbol, priceData);
    }
  }

  async compareCoins(symbols: string[], pricesMap: Map<string, CryptoPrice>): Promise<string> {
    try {
      const dataString = Array.from(pricesMap.entries())
        .map(([sym, data]) => `${sym}: $${data.price} (${data.changePercent24h > 0 ? '+' : ''}${data.changePercent24h.toFixed(2)}%)`)
        .join('\n');

      const prompt = `Порівняй ці криптовалюти та дай висновки:

${dataString}

Надай коротке порівняння (3-4 речення), включаючи:
1. Яка монета має найсильніший тренд
2. Відносні відмінності у продуктивності
3. Яка монета краще позиціонована на короткий термін

Будь коротким та практичним.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      return response.text || "Неможливо створити порівняння на даний момент.";
    } catch (error) {
      console.error('Comparison error:', error);
      return "Неможливо порівняти монети на даний момент.";
    }
  }

  async predictTrend(symbol: string, priceData: CryptoPrice): Promise<string> {
    try {
      const prompt = `На основі поточних даних ${symbol}:
- Ціна: $${priceData.price}
- Зміна за 24 год: ${priceData.changePercent24h > 0 ? '+' : ''}${priceData.changePercent24h.toFixed(2)}%
- Обсяг: ${priceData.volume24h}

Надай прогноз короткострокового тренду (на наступні 24-48 годин) у 2-3 реченнях. Розглянь:
- Поточний тренд
- Динаміку обсягів
- Недавню поведінку ціни

Будь конкретним, але враховуй невизначеність.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      return response.text || "Неможливо створити прогноз на даний момент.";
    } catch (error) {
      console.error('Prediction error:', error);
      return "Неможливо створити прогноз на даний момент.";
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
      summary: `${symbol} торгується зараз по $${priceData.price.toFixed(2)} зі зміною ${priceData.changePercent24h.toFixed(2)}% за останні 24 години.`,
      sentiment,
      keyPoints: [
        `Діапазон цін за 24 год: $${priceData.low24h.toFixed(2)} - $${priceData.high24h.toFixed(2)}`,
        `Поточний тренд ${isPositive ? 'позитивний' : 'негативний'} з зміною ${absChange.toFixed(2)}%`,
        `Обсяг торгів вказує на ${priceData.volume24h > 100000 ? 'високу' : 'помірну'} активність ринку`,
      ],
      recommendation: absChange > 5 
        ? `${isPositive ? 'Сильний зростаючий' : 'Сильний спадний'} тренд. Слідкуйте уважно для потенційного ${isPositive ? 'продовження' : 'розвороту'}.`
        : 'Ринок демонструє консолидацію. Чекайте більш чітких сигналів перед дією.',
    };
  }
}

export const aiAnalyst = new AIAnalystService();
