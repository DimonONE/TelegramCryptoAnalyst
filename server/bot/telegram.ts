import TelegramBot from 'node-telegram-bot-api';
import { cryptoApi } from '../services/cryptoApi';
import { aiAnalyst } from '../services/aiAnalyst';
import { storage } from '../storage';
import type { InsertPortfolioHolding, InsertPriceAlert } from '@shared/schema';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// User state management for multi-step conversations
interface UserState {
  action?: 'add_portfolio' | 'remove_portfolio';
  symbol?: string;
}

export class CryptoAnalystBot {
  private bot: TelegramBot;
  private userStates: Map<number, UserState> = new Map();

  constructor() {
    this.bot = new TelegramBot(BOT_TOKEN, { polling: true });
    this.setupCommands();
    this.setupCallbackHandlers();
    this.setupMessageHandlers();
  }

  private setupCommands() {
    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const welcomeMessage = `🤖 *Welcome to Crypto Analyst AI Bot!*

Your personal AI-powered cryptocurrency analyst with real-time market data from Binance.

*Available Commands:*
/analyze <COIN> - AI analysis of any crypto
/price <COIN> - Current price & 24h stats
/portfolio - View your portfolio
/add <COIN> <AMOUNT> - Add coin to portfolio
/remove <COIN> - Remove coin from portfolio
/alert <COIN> <PRICE> <above/below> - Set price alert
/alerts - View your active alerts
/top - Top gainers & losers
/help - Show this help message

*Quick Actions:*`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📊 Analyze BTC', callback_data: 'analyze_BTC' },
            { text: '💰 BTC Price', callback_data: 'price_BTC' }
          ],
          [
            { text: '🎯 My Portfolio', callback_data: 'portfolio' },
            { text: '🔔 My Alerts', callback_data: 'alerts' }
          ],
          [
            { text: '📈 Top Gainers', callback_data: 'top_gainers' },
            { text: '📉 Top Losers', callback_data: 'top_losers' }
          ],
          [
            { text: 'ℹ️ Help', callback_data: 'help' }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      await this.sendHelpMessage(msg.chat.id);
    });

    // Analyze command
    this.bot.onText(/\/analyze (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const symbol = match?.[1]?.trim().toUpperCase();
      
      if (!symbol) {
        await this.bot.sendMessage(chatId, '❌ Please specify a coin symbol.\nExample: /analyze BTC');
        return;
      }

      await this.analyzeSymbol(chatId, symbol);
    });

    // Price command
    this.bot.onText(/\/price (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const symbol = match?.[1]?.trim().toUpperCase();
      
      if (!symbol) {
        await this.bot.sendMessage(chatId, '❌ Please specify a coin symbol.\nExample: /price ETH');
        return;
      }

      await this.showPrice(chatId, symbol);
    });

    // Portfolio command
    this.bot.onText(/\/portfolio/, async (msg) => {
      await this.showPortfolio(msg.chat.id);
    });

    // Add to portfolio command
    this.bot.onText(/\/add (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const params = match?.[1]?.trim().split(/\s+/);
      
      if (!params || params.length < 2) {
        await this.bot.sendMessage(chatId, 
          '❌ Invalid format.\n\n*Usage:* /add <COIN> <AMOUNT>\n\n*Example:* /add BTC 0.5',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const symbol = params[0].toUpperCase();
      const amount = parseFloat(params[1]);

      if (isNaN(amount) || amount <= 0) {
        await this.bot.sendMessage(chatId, '❌ Invalid amount. Please enter a positive number.');
        return;
      }

      await this.addToPortfolio(chatId, symbol, amount);
    });

    // Remove from portfolio command
    this.bot.onText(/\/remove (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const symbol = match?.[1]?.trim().toUpperCase();
      
      if (!symbol) {
        await this.bot.sendMessage(chatId, '❌ Please specify a coin symbol.\nExample: /remove BTC');
        return;
      }

      await this.removeFromPortfolio(chatId, symbol);
    });

    // Alert command
    this.bot.onText(/\/alert (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const params = match?.[1]?.trim().split(/\s+/);
      
      if (!params || params.length < 3) {
        await this.bot.sendMessage(chatId, 
          '❌ Invalid format.\n\n*Usage:* /alert <COIN> <PRICE> <above/below>\n\n*Example:* /alert BTC 50000 above',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const symbol = params[0].toUpperCase();
      const price = parseFloat(params[1]);
      const condition = params[2].toLowerCase();

      if (isNaN(price)) {
        await this.bot.sendMessage(chatId, '❌ Invalid price. Please enter a number.');
        return;
      }

      if (condition !== 'above' && condition !== 'below') {
        await this.bot.sendMessage(chatId, '❌ Condition must be "above" or "below".');
        return;
      }

      await this.createAlert(chatId, symbol, price, condition);
    });

    // Alerts command
    this.bot.onText(/\/alerts/, async (msg) => {
      await this.showAlerts(msg.chat.id);
    });

    // Top command
    this.bot.onText(/\/top/, async (msg) => {
      await this.showTopCoins(msg.chat.id);
    });
  }

  private setupMessageHandlers() {
    // Handle text messages for conversation flows
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      // Skip if it's a command
      if (!text || text.startsWith('/')) {
        return;
      }

      const userState = this.userStates.get(chatId);
      if (!userState) {
        return;
      }

      // Handle portfolio addition
      if (userState.action === 'add_portfolio' && userState.symbol) {
        const amount = parseFloat(text);
        
        if (isNaN(amount) || amount <= 0) {
          await this.bot.sendMessage(chatId, '❌ Invalid amount. Please enter a positive number or use /cancel to stop.');
          return;
        }

        await this.addToPortfolio(chatId, userState.symbol, amount);
        this.userStates.delete(chatId);
      }
    });
  }

  private setupCallbackHandlers() {
    this.bot.on('callback_query', async (callbackQuery) => {
      const message = callbackQuery.message;
      const data = callbackQuery.data;
      
      if (!message || !data) return;

      const chatId = message.chat.id;

      // Answer callback to remove loading state
      await this.bot.answerCallbackQuery(callbackQuery.id);

      // Handle different callbacks
      if (data.startsWith('analyze_')) {
        const symbol = data.replace('analyze_', '');
        await this.analyzeSymbol(chatId, symbol);
      } else if (data.startsWith('price_')) {
        const symbol = data.replace('price_', '');
        await this.showPrice(chatId, symbol);
      } else if (data === 'portfolio') {
        await this.showPortfolio(chatId);
      } else if (data === 'alerts') {
        await this.showAlerts(chatId);
      } else if (data === 'top_gainers') {
        await this.showTopGainers(chatId);
      } else if (data === 'top_losers') {
        await this.showTopLosers(chatId);
      } else if (data === 'help') {
        await this.sendHelpMessage(chatId);
      } else if (data.startsWith('add_portfolio_')) {
        const symbol = data.replace('add_portfolio_', '');
        this.userStates.set(chatId, { action: 'add_portfolio', symbol });
        await this.bot.sendMessage(chatId, 
          `💰 *Add ${symbol} to Portfolio*\n\nHow much ${symbol} do you own?\n\nExample: 0.5\n\nOr use: /add ${symbol} <amount>`,
          { parse_mode: 'Markdown' }
        );
      } else if (data.startsWith('remove_alert_')) {
        const alertId = data.replace('remove_alert_', '');
        await storage.removePriceAlert(alertId);
        await this.bot.sendMessage(chatId, '✅ Alert removed successfully!');
        await this.showAlerts(chatId);
      }
    });
  }

  private async addToPortfolio(chatId: number, symbol: string, amount: number) {
    try {
      // Verify the symbol exists
      const priceData = await cryptoApi.getPrice(symbol);
      
      if (!priceData) {
        await this.bot.sendMessage(chatId, `❌ Invalid symbol: ${symbol}`);
        return;
      }

      const holding: InsertPortfolioHolding = {
        chatId: chatId.toString(),
        symbol: symbol.toUpperCase(),
        amount
      };

      await storage.addPortfolioHolding(holding);

      const value = amount * priceData.price;
      const message = `✅ *Added to Portfolio!*\n\n${symbol}: ${amount} coins\n≈ $${value.toFixed(2)}\n\nUse /portfolio to view your holdings.`;

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Add to portfolio error:', error);
      await this.bot.sendMessage(chatId, '❌ Error adding to portfolio. Please try again.');
    }
  }

  private async removeFromPortfolio(chatId: number, symbol: string) {
    try {
      const removed = await storage.removePortfolioHolding(chatId.toString(), symbol);
      
      if (removed) {
        await this.bot.sendMessage(chatId, `✅ ${symbol} removed from portfolio.`);
      } else {
        await this.bot.sendMessage(chatId, `❌ ${symbol} not found in your portfolio.`);
      }
    } catch (error) {
      console.error('Remove from portfolio error:', error);
      await this.bot.sendMessage(chatId, '❌ Error removing from portfolio. Please try again.');
    }
  }

  private async analyzeSymbol(chatId: number, symbol: string) {
    const statusMsg = await this.bot.sendMessage(chatId, '⏳ Analyzing market data...');

    try {
      const priceData = await cryptoApi.getPrice(symbol);
      
      if (!priceData) {
        await this.bot.editMessageText(
          `❌ Unable to fetch data for ${symbol}. Please check the symbol and try again.`,
          { chat_id: chatId, message_id: statusMsg.message_id }
        );
        return;
      }

      await this.bot.editMessageText('🤖 AI is analyzing...', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });

      const analysis = await aiAnalyst.analyzeCrypto(symbol, priceData);

      const emoji = priceData.changePercent24h >= 0 ? '🟢' : '🔴';
      const sign = priceData.changePercent24h >= 0 ? '+' : '';
      const sentimentEmoji = analysis.sentiment === 'bullish' ? '📈' : analysis.sentiment === 'bearish' ? '📉' : '➡️';

      let message = `📊 *${symbol} ANALYSIS*\n\n`;
      message += `💰 *Current Price:* $${cryptoApi.formatPrice(priceData.price)}\n`;
      message += `24h Change: ${emoji} ${sign}${priceData.changePercent24h.toFixed(2)}% (${sign}$${Math.abs(priceData.change24h).toFixed(2)})\n`;
      message += `Volume: ${cryptoApi.formatVolume(priceData.volume24h * priceData.price)}\n`;
      message += `High: $${cryptoApi.formatPrice(priceData.high24h)} | Low: $${cryptoApi.formatPrice(priceData.low24h)}\n\n`;
      
      message += `${sentimentEmoji} *AI Analysis*\n`;
      message += `${analysis.summary}\n\n`;
      
      message += `*Key Insights:*\n`;
      analysis.keyPoints.forEach(point => {
        message += `• ${point}\n`;
      });
      
      message += `\n💡 *Recommendation:*\n${analysis.recommendation}\n\n`;
      message += `_Last updated: ${new Date().toUTCString()}_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: `analyze_${symbol}` },
            { text: '💰 Check Price', callback_data: `price_${symbol}` }
          ],
          [
            { text: '➕ Add to Portfolio', callback_data: `add_portfolio_${symbol}` }
          ],
          [
            { text: '🔙 Main Menu', callback_data: 'help' }
          ]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Analysis error:', error);
      await this.bot.editMessageText(
        `❌ An error occurred while analyzing ${symbol}. Please try again later.`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
    }
  }

  private async showPrice(chatId: number, symbol: string) {
    const statusMsg = await this.bot.sendMessage(chatId, '⏳ Fetching price data...');

    try {
      const priceData = await cryptoApi.getPrice(symbol);
      
      if (!priceData) {
        await this.bot.editMessageText(
          `❌ Unable to fetch price for ${symbol}. Please check the symbol and try again.`,
          { chat_id: chatId, message_id: statusMsg.message_id }
        );
        return;
      }

      const emoji = priceData.changePercent24h >= 0 ? '🟢' : '🔴';
      const sign = priceData.changePercent24h >= 0 ? '+' : '';

      let message = `💰 *${symbol} Price Info*\n\n`;
      message += `*Price:* $${cryptoApi.formatPrice(priceData.price)}\n`;
      message += `24h Change: ${emoji} ${sign}${priceData.changePercent24h.toFixed(2)}% (${sign}$${Math.abs(priceData.change24h).toFixed(2)})\n`;
      message += `Volume: ${cryptoApi.formatVolume(priceData.volume24h * priceData.price)}\n`;
      message += `High: $${cryptoApi.formatPrice(priceData.high24h)}\n`;
      message += `Low: $${cryptoApi.formatPrice(priceData.low24h)}\n\n`;
      message += `_Last updated: ${new Date().toLocaleTimeString()} UTC_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📊 Full Analysis', callback_data: `analyze_${symbol}` },
            { text: '🔄 Refresh', callback_data: `price_${symbol}` }
          ],
          [
            { text: '🔙 Main Menu', callback_data: 'help' }
          ]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Price fetch error:', error);
      await this.bot.editMessageText(
        `❌ An error occurred while fetching price for ${symbol}.`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
    }
  }

  private async showPortfolio(chatId: number) {
    try {
      const holdings = await storage.getPortfolioHoldings(chatId.toString());

      if (holdings.length === 0) {
        const message = `🎯 *Your Portfolio*\n\n_Portfolio is empty_\n\nAdd coins using:\n/add <COIN> <AMOUNT>\n\nExample: /add BTC 0.5`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '📊 Analyze BTC', callback_data: 'analyze_BTC' },
              { text: '📊 Analyze ETH', callback_data: 'analyze_ETH' }
            ],
            [
              { text: '🔙 Main Menu', callback_data: 'help' }
            ]
          ]
        };

        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
      }

      const statusMsg = await this.bot.sendMessage(chatId, '⏳ Updating portfolio...');

      // Fetch current prices
      const symbols = holdings.map(h => h.symbol);
      const prices = await cryptoApi.getMultiplePrices(symbols);

      let totalValue = 0;
      let message = `🎯 *Your Portfolio*\n\n`;

      holdings.forEach(holding => {
        const priceData = prices.get(holding.symbol.toUpperCase());
        if (priceData) {
          const value = holding.amount * priceData.price;
          totalValue += value;
          const emoji = priceData.changePercent24h >= 0 ? '🟢' : '🔴';
          const sign = priceData.changePercent24h >= 0 ? '+' : '';
          
          message += `*${holding.symbol}:* ${holding.amount.toFixed(4)}\n`;
          message += `  ≈ $${value.toFixed(2)} ${emoji} ${sign}${priceData.changePercent24h.toFixed(2)}%\n\n`;
        }
      });

      message += `─────────────────\n`;
      message += `*Total Value:* $${totalValue.toFixed(2)}\n\n`;
      message += `_Last updated: ${new Date().toLocaleTimeString()} UTC_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: 'portfolio' }
          ],
          [
            { text: '🔙 Main Menu', callback_data: 'help' }
          ]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Portfolio error:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading portfolio. Please try again.');
    }
  }

  private async showAlerts(chatId: number) {
    try {
      const alerts = await storage.getPriceAlerts(chatId.toString());

      let message = `🔔 *Your Price Alerts*\n\n`;

      if (alerts.length === 0) {
        message += `_No active alerts_\n\nSet an alert using:\n/alert <COIN> <PRICE> <above/below>\n\nExample: /alert BTC 50000 above`;
        
        await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        return;
      }

      const keyboard: any = { inline_keyboard: [] };

      alerts.forEach(alert => {
        const status = alert.triggered ? '✅ Triggered' : '⏳ Active';
        message += `*${alert.symbol}* ${alert.condition} $${cryptoApi.formatPrice(alert.targetPrice)}\n`;
        message += `Status: ${status}\n\n`;

        if (!alert.triggered) {
          keyboard.inline_keyboard.push([
            { text: `❌ Remove ${alert.symbol} Alert`, callback_data: `remove_alert_${alert.id}` }
          ]);
        }
      });

      keyboard.inline_keyboard.push([
        { text: '🔙 Main Menu', callback_data: 'help' }
      ]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Alerts error:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading alerts. Please try again.');
    }
  }

  private async createAlert(chatId: number, symbol: string, targetPrice: number, condition: string) {
    try {
      // Verify the symbol exists
      const priceData = await cryptoApi.getPrice(symbol);
      
      if (!priceData) {
        await this.bot.sendMessage(chatId, `❌ Invalid symbol: ${symbol}`);
        return;
      }

      const alert: InsertPriceAlert = {
        chatId: chatId.toString(),
        symbol: symbol.toUpperCase(),
        targetPrice,
        condition
      };

      await storage.addPriceAlert(alert);

      const message = `✅ *Alert Set Successfully!*\n\n${symbol} ${condition} $${cryptoApi.formatPrice(targetPrice)}\n\nCurrent price: $${cryptoApi.formatPrice(priceData.price)}\n\nYou'll be notified when the target is reached.`;

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Create alert error:', error);
      await this.bot.sendMessage(chatId, '❌ Error creating alert. Please try again.');
    }
  }

  private async showTopGainers(chatId: number) {
    const statusMsg = await this.bot.sendMessage(chatId, '⏳ Fetching top gainers...');

    try {
      const gainers = await cryptoApi.getTopGainers(10);

      let message = `📈 *TOP GAINERS (24h)*\n\n`;

      gainers.forEach((coin, index) => {
        message += `${index + 1}. *${coin.symbol}* $${cryptoApi.formatPrice(coin.price)}\n`;
        message += `   🟢 +${coin.changePercent24h.toFixed(2)}%\n\n`;
      });

      message += `_Last updated: ${new Date().toLocaleTimeString()} UTC_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: 'top_gainers' },
            { text: '📉 Top Losers', callback_data: 'top_losers' }
          ],
          [
            { text: '🔙 Main Menu', callback_data: 'help' }
          ]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Top gainers error:', error);
      await this.bot.editMessageText('❌ Error fetching top gainers.', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
    }
  }

  private async showTopLosers(chatId: number) {
    const statusMsg = await this.bot.sendMessage(chatId, '⏳ Fetching top losers...');

    try {
      const losers = await cryptoApi.getTopLosers(10);

      let message = `📉 *TOP LOSERS (24h)*\n\n`;

      losers.forEach((coin, index) => {
        message += `${index + 1}. *${coin.symbol}* $${cryptoApi.formatPrice(coin.price)}\n`;
        message += `   🔴 ${coin.changePercent24h.toFixed(2)}%\n\n`;
      });

      message += `_Last updated: ${new Date().toLocaleTimeString()} UTC_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: 'top_losers' },
            { text: '📈 Top Gainers', callback_data: 'top_gainers' }
          ],
          [
            { text: '🔙 Main Menu', callback_data: 'help' }
          ]
        ]
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Top losers error:', error);
      await this.bot.editMessageText('❌ Error fetching top losers.', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
    }
  }

  private async showTopCoins(chatId: number) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📈 Top Gainers', callback_data: 'top_gainers' },
          { text: '📉 Top Losers', callback_data: 'top_losers' }
        ],
        [
          { text: '🔙 Main Menu', callback_data: 'help' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, 
      '📊 *Market Leaders*\n\nChoose what you want to see:',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }

  private async sendHelpMessage(chatId: number) {
    const message = `ℹ️ *Crypto Analyst AI Bot - Help*\n\n*Commands:*\n\n` +
      `/analyze <COIN> - Get AI-powered analysis\n` +
      `Example: /analyze BTC\n\n` +
      `/price <COIN> - Current price & 24h stats\n` +
      `Example: /price ETH\n\n` +
      `/portfolio - View your holdings\n` +
      `/add <COIN> <AMOUNT> - Add to portfolio\n` +
      `Example: /add BTC 0.5\n\n` +
      `/remove <COIN> - Remove from portfolio\n\n` +
      `/alert <COIN> <PRICE> <above/below> - Set price alert\n` +
      `Example: /alert BTC 50000 above\n\n` +
      `/alerts - View your alerts\n` +
      `/top - View top gainers & losers\n\n` +
      `*Features:*\n` +
      `• Real-time prices from Binance\n` +
      `• AI-powered market analysis (Google Gemini)\n` +
      `• Portfolio tracking\n` +
      `• Price alerts (checked every 2 min)\n` +
      `• Top movers tracking\n\n` +
      `*Supported Coins:*\n` +
      `BTC, ETH, BNB, SOL, XRP, ADA, DOGE, DOT, MATIC, and many more!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📊 Analyze BTC', callback_data: 'analyze_BTC' },
          { text: '💰 BTC Price', callback_data: 'price_BTC' }
        ],
        [
          { text: '📈 Top Gainers', callback_data: 'top_gainers' },
          { text: '📉 Top Losers', callback_data: 'top_losers' }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  public async sendAlert(chatId: string, symbol: string, currentPrice: number, targetPrice: number, condition: string) {
    try {
      const emoji = condition === 'above' ? '🔼' : '🔽';
      const message = `🔔 *PRICE ALERT!*\n\n` +
        `${symbol} has crossed your target!\n\n` +
        `Current: $${cryptoApi.formatPrice(currentPrice)}\n` +
        `Your target: $${cryptoApi.formatPrice(targetPrice)} (${condition})\n` +
        `${emoji} Target reached!`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📊 Analyze', callback_data: `analyze_${symbol}` },
            { text: '💰 Price', callback_data: `price_${symbol}` }
          ]
        ]
      };

      await this.bot.sendMessage(parseInt(chatId), message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Send alert error:', error);
    }
  }

  public start() {
    console.log('🤖 Crypto Analyst Bot is running...');
  }

  public stop() {
    this.bot.stopPolling();
  }
}
