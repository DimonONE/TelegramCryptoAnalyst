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
  private coingeckoBaseUrl = 'https://api.coingecko.com/api/v3';

  // Map common symbols to CoinGecko IDs
  private symbolToCoinId(symbol: string): string {
    const symbolMap: { [key: string]: string } = {
      // Top cryptocurrencies
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      'SOL': 'solana',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'DOT': 'polkadot',
      'MATIC': 'matic-network',
      'SHIB': 'shiba-inu',
      'AVAX': 'avalanche-2',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'ATOM': 'cosmos',
      'LTC': 'litecoin',
      'BCH': 'bitcoin-cash',
      'XLM': 'stellar',
      'ALGO': 'algorand',
      'VET': 'vechain',
      'ICP': 'internet-computer',
      'FIL': 'filecoin',
      'TRX': 'tron',
      'ETC': 'ethereum-classic',
      'NEAR': 'near',
      'APT': 'aptos',
      'OP': 'optimism',
      'ARB': 'arbitrum',
      'SUI': 'sui',
      // Stablecoins
      'USDT': 'tether',
      'USDC': 'usd-coin',
      'BUSD': 'binance-usd',
      'DAI': 'dai',
      'TUSD': 'true-usd',
      'USDD': 'usdd',
      // Wrapped tokens
      'WBTC': 'wrapped-bitcoin',
      'WETH': 'weth',
      // Layer 2 and scaling
      'MANA': 'decentraland',
      'SAND': 'the-sandbox',
      'AXS': 'axie-infinity',
      'IMX': 'immutable-x',
      'LDO': 'lido-dao',
      'CRV': 'curve-dao-token',
      'AAVE': 'aave',
      'MKR': 'maker',
      'SNX': 'havven',
      'COMP': 'compound-governance-token',
      'YFI': 'yearn-finance',
      'SUSHI': 'sushi',
      'GRT': 'the-graph',
      '1INCH': '1inch',
      'ENJ': 'enjincoin',
      'CHZ': 'chiliz',
      'THETA': 'theta-token',
      'FTM': 'fantom',
      'RUNE': 'thorchain',
      'KLAY': 'klay-token',
      'HBAR': 'hedera-hashgraph',
      'FLOW': 'flow',
      'XTZ': 'tezos',
      'EOS': 'eos',
      'NEO': 'neo',
      'WAVES': 'waves',
      'ZEC': 'zcash',
      'DASH': 'dash',
      'XMR': 'monero',
    };
    
    return symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  async getPrice(symbol: string): Promise<CryptoPrice | null> {
    try {
      const upperSymbol = symbol.toUpperCase();
      const coinId = this.symbolToCoinId(symbol);

      // Get current price and 24h market data from CoinGecko
      const response = await axios.get(`${this.coingeckoBaseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          ids: coinId,
          order: 'market_cap_desc',
          per_page: 1,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        }
      });

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const data = response.data[0];

      return {
        symbol: upperSymbol,
        price: data.current_price,
        change24h: data.price_change_24h || 0,
        changePercent24h: data.price_change_percentage_24h || 0,
        volume24h: data.total_volume || 0,
        high24h: data.high_24h || data.current_price,
        low24h: data.low_24h || data.current_price,
        marketCap: data.market_cap,
      };
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      return null;
    }
  }

  async getMultiplePrices(symbols: string[]): Promise<Map<string, CryptoPrice>> {
    const prices = new Map<string, CryptoPrice>();
    
    try {
      // Convert symbols to coin IDs
      const coinIds = symbols.map(s => this.symbolToCoinId(s)).join(',');

      // Fetch all prices in one request
      const response = await axios.get(`${this.coingeckoBaseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          ids: coinIds,
          order: 'market_cap_desc',
          per_page: symbols.length,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        }
      });

      if (response.data && Array.isArray(response.data)) {
        response.data.forEach((data: any) => {
          // Find the original symbol
          const symbol = symbols.find(s => this.symbolToCoinId(s) === data.id);
          if (symbol) {
            prices.set(symbol.toUpperCase(), {
              symbol: symbol.toUpperCase(),
              price: data.current_price,
              change24h: data.price_change_24h || 0,
              changePercent24h: data.price_change_percentage_24h || 0,
              volume24h: data.total_volume || 0,
              high24h: data.high_24h || data.current_price,
              low24h: data.low_24h || data.current_price,
              marketCap: data.market_cap,
            });
          }
        });
      }
    } catch (error) {
      console.error('Error fetching multiple prices:', error);
      // Fallback to individual requests
      const results = await Promise.allSettled(
        symbols.map(symbol => this.getPrice(symbol))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          prices.set(symbols[index].toUpperCase(), result.value);
        }
      });
    }

    return prices;
  }

  async getTopGainers(limit: number = 10): Promise<TopCoin[]> {
    try {
      // Get top coins by market cap with 24h change
      const response = await axios.get(`${this.coingeckoBaseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 250, // Get larger set to filter gainers
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        }
      });

      const gainers = response.data
        .filter((coin: any) => coin.price_change_percentage_24h > 0)
        .sort((a: any, b: any) => b.price_change_percentage_24h - a.price_change_percentage_24h)
        .slice(0, limit)
        .map((coin: any) => ({
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          price: coin.current_price,
          changePercent24h: coin.price_change_percentage_24h,
          marketCap: coin.market_cap,
        }));

      return gainers;
    } catch (error) {
      console.error('Error fetching top gainers:', error);
      return [];
    }
  }

  async getTopLosers(limit: number = 10): Promise<TopCoin[]> {
    try {
      // Get top coins by market cap with 24h change
      const response = await axios.get(`${this.coingeckoBaseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 250, // Get larger set to filter losers
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        }
      });

      const losers = response.data
        .filter((coin: any) => coin.price_change_percentage_24h < 0)
        .sort((a: any, b: any) => a.price_change_percentage_24h - b.price_change_percentage_24h)
        .slice(0, limit)
        .map((coin: any) => ({
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          price: coin.current_price,
          changePercent24h: coin.price_change_percentage_24h,
          marketCap: coin.market_cap,
        }));

      return losers;
    } catch (error) {
      console.error('Error fetching top losers:', error);
      return [];
    }
  }

  // Helper method to format large numbers
  formatPrice(price: number): string {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (price >= 1) {
      return price.toFixed(4);
    } else {
      return price.toFixed(8);
    }
  }

  // Helper method to format volume
  formatVolume(volume: number): string {
    if (volume >= 1000000000) {
      return `$${(volume / 1000000000).toFixed(2)}B`;
    } else if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(2)}K`;
    }
    return `$${volume.toFixed(2)}`;
  }
}

export const cryptoApi = new CryptoApiService();
