import axios from 'axios';

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  marketCap?: number;
}

export interface TopCoin {
  symbol: string;
  name: string;
  price: number;
  changePercent24h: number;
  marketCap: number;
}

class CryptoApiService {
  private binanceBaseUrl = 'https://api.binance.com/api/v3';
  private coingeckoBaseUrl = 'https://api.coingecko.com/api/v3';

  async getPrice(symbol: string): Promise<CryptoPrice | null> {
    try {
      const upperSymbol = symbol.toUpperCase();
      const pair = `${upperSymbol}USDT`;

      // Get current price and 24h stats from Binance
      const [tickerResponse, priceResponse] = await Promise.all([
        axios.get(`${this.binanceBaseUrl}/ticker/24hr`, { params: { symbol: pair } }),
        axios.get(`${this.binanceBaseUrl}/ticker/price`, { params: { symbol: pair } })
      ]);

      const ticker = tickerResponse.data;
      const currentPrice = parseFloat(priceResponse.data.price);
      const priceChange = parseFloat(ticker.priceChange);
      const priceChangePercent = parseFloat(ticker.priceChangePercent);
      const volume = parseFloat(ticker.volume);
      const high = parseFloat(ticker.highPrice);
      const low = parseFloat(ticker.lowPrice);

      return {
        symbol: upperSymbol,
        price: currentPrice,
        change24h: priceChange,
        changePercent24h: priceChangePercent,
        volume24h: volume,
        high24h: high,
        low24h: low,
      };
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      return null;
    }
  }

  async getMultiplePrices(symbols: string[]): Promise<Map<string, CryptoPrice>> {
    const prices = new Map<string, CryptoPrice>();
    
    const results = await Promise.allSettled(
      symbols.map(symbol => this.getPrice(symbol))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        prices.set(symbols[index].toUpperCase(), result.value);
      }
    });

    return prices;
  }

  async getTopGainers(limit: number = 10): Promise<TopCoin[]> {
    try {
      // Get all USDT pairs from Binance
      const response = await axios.get(`${this.binanceBaseUrl}/ticker/24hr`);
      const tickers = response.data;

      // Filter for USDT pairs and sort by percentage gain
      const gainers = tickers
        .filter((t: any) => t.symbol.endsWith('USDT') && parseFloat(t.priceChangePercent) > 0)
        .sort((a: any, b: any) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
        .slice(0, limit)
        .map((t: any) => ({
          symbol: t.symbol.replace('USDT', ''),
          name: t.symbol.replace('USDT', ''),
          price: parseFloat(t.lastPrice),
          changePercent24h: parseFloat(t.priceChangePercent),
          marketCap: parseFloat(t.quoteVolume),
        }));

      return gainers;
    } catch (error) {
      console.error('Error fetching top gainers:', error);
      return [];
    }
  }

  async getTopLosers(limit: number = 10): Promise<TopCoin[]> {
    try {
      const response = await axios.get(`${this.binanceBaseUrl}/ticker/24hr`);
      const tickers = response.data;

      // Filter for USDT pairs and sort by percentage loss
      const losers = tickers
        .filter((t: any) => t.symbol.endsWith('USDT') && parseFloat(t.priceChangePercent) < 0)
        .sort((a: any, b: any) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent))
        .slice(0, limit)
        .map((t: any) => ({
          symbol: t.symbol.replace('USDT', ''),
          name: t.symbol.replace('USDT', ''),
          price: parseFloat(t.lastPrice),
          changePercent24h: parseFloat(t.priceChangePercent),
          marketCap: parseFloat(t.quoteVolume),
        }));

      return losers;
    } catch (error) {
      console.error('Error fetching top losers:', error);
      return [];
    }
  }

  async getMarketOverview(): Promise<string> {
    try {
      // Get major coins data
      const majorCoins = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP'];
      const prices = await this.getMultiplePrices(majorCoins);
      
      let overview = '📊 MARKET OVERVIEW\n\n';
      
      for (const [symbol, data] of prices) {
        const emoji = data.changePercent24h >= 0 ? '🟢' : '🔴';
        const sign = data.changePercent24h >= 0 ? '+' : '';
        overview += `${symbol}: $${this.formatPrice(data.price)} ${emoji} ${sign}${data.changePercent24h.toFixed(2)}%\n`;
      }

      return overview;
    } catch (error) {
      console.error('Error getting market overview:', error);
      return 'Unable to fetch market overview at this time.';
    }
  }

  formatPrice(price: number): string {
    if (price >= 1) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (price >= 0.01) {
      return price.toFixed(4);
    } else {
      return price.toFixed(8);
    }
  }

  formatVolume(volume: number): string {
    if (volume >= 1_000_000_000) {
      return `$${(volume / 1_000_000_000).toFixed(2)}B`;
    } else if (volume >= 1_000_000) {
      return `$${(volume / 1_000_000).toFixed(2)}M`;
    } else if (volume >= 1_000) {
      return `$${(volume / 1_000).toFixed(2)}K`;
    }
    return `$${volume.toFixed(2)}`;
  }
}

export const cryptoApi = new CryptoApiService();
