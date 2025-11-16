import TelegramBot from "node-telegram-bot-api";
import { cryptoApi } from "../services/cryptoApi";
import { aiAnalyst } from "../services/aiAnalyst";
import { storage } from "../storage";
import type { InsertPortfolioHolding, InsertPriceAlert } from "@shared/schema";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// User state management for multi-step conversations
interface UserState {
  action?: "add_portfolio" | "remove_portfolio";
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
      const welcomeMessage = `🤖 *Вітаємо в Crypto Analyst AI Bot!*

    Ваш персональний AI-аналітик криптовалют із реальними ринковими даними з Binance.

    *Доступні команди:*
    /analyze <COIN> - AI аналіз будь-якої криптовалюти
    /price <COIN> - Поточна ціна та статистика за 24h
    /portfolio - Перегляд портфоліо
    /add <COIN> <AMOUNT> - Додати монету в портфоліо
    /remove <COIN> - Видалити монету з портфоліо
    /alert <COIN> <PRICE> <above/below> - Створити ціновий алерт
    /alerts - Всі активні алерти
    /top - Топ зростаючих та падаючих монет
    /help - Показати довідку

    *Швидкі дії:*`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "📊 Аналіз BTC", callback_data: "analyze_BTC" },
            { text: "💰 Ціна BTC", callback_data: "price_BTC" },
          ],
          [
            { text: "🎯 Моє портфоліо", callback_data: "portfolio" },
            { text: "🔔 Мої алерти", callback_data: "alerts" },
          ],
          [
            { text: "📈 Топ зростання", callback_data: "top_gainers" },
            { text: "📉 Топ падіння", callback_data: "top_losers" },
          ],
          [{ text: "ℹ️ Допомога", callback_data: "help" }],
        ],
      };

      await this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
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
        await this.bot.sendMessage(
          chatId,
          "❌ Вкажіть символ монети.\nПриклад: /analyze BTC",
        );
        return;
      }

      await this.analyzeSymbol(chatId, symbol);
    });

    // Price command
    this.bot.onText(/\/price (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const symbol = match?.[1]?.trim().toUpperCase();

      if (!symbol) {
        await this.bot.sendMessage(
          chatId,
          "❌ Вкажіть символ монети.\nПриклад: /price ETH",
        );
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
        await this.bot.sendMessage(
          chatId,
          "❌ Невірний формат.\n\n*Використання:* /add <COIN> <AMOUNT>\n\n*Приклад:* /add BTC 0.5",
          { parse_mode: "Markdown" },
        );
        return;
      }

      const symbol = params[0].toUpperCase();
      const amount = parseFloat(params[1]);

      if (isNaN(amount) || amount <= 0) {
        await this.bot.sendMessage(
          chatId,
          "❌ Некоректна кількість. Введіть додатнє число.",
        );
        return;
      }

      await this.addToPortfolio(chatId, symbol, amount);
    });

    // Remove from portfolio
    this.bot.onText(/\/remove (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const symbol = match?.[1]?.trim().toUpperCase();

      if (!symbol) {
        await this.bot.sendMessage(
          chatId,
          "❌ Вкажіть символ монети.\nПриклад: /remove BTC",
        );
        return;
      }

      await this.removeFromPortfolio(chatId, symbol);
    });

    // Alert command
    this.bot.onText(/\/alert (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const params = match?.[1]?.trim().split(/\s+/);

      if (!params || params.length < 3) {
        await this.bot.sendMessage(
          chatId,
          "❌ Невірний формат.\n\n*Використання:* /alert <COIN> <PRICE> <above/below>\n\n*Приклад:* /alert BTC 50000 above",
          { parse_mode: "Markdown" },
        );
        return;
      }

      const symbol = params[0].toUpperCase();
      const price = parseFloat(params[1]);
      const condition = params[2].toLowerCase();

      if (isNaN(price)) {
        await this.bot.sendMessage(chatId, "❌ Невірна ціна. Введіть число.");
        return;
      }

      if (condition !== "above" && condition !== "below") {
        await this.bot.sendMessage(
          chatId,
          "❌ Параметр має бути «above» або «below».",
        );
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
    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      // Skip if it's a command
      if (!text || text.startsWith("/")) {
        return;
      }

      const userState = this.userStates.get(chatId);
      if (!userState) {
        return;
      }

      // Handle portfolio addition
      if (userState.action === "add_portfolio" && userState.symbol) {
        const amount = parseFloat(text);

        if (isNaN(amount) || amount <= 0) {
          await this.bot.sendMessage(
            chatId,
            "❌ Некоректна кількість. Введіть додатнє число або використайте /cancel.",
          );
          return;
        }

        await this.addToPortfolio(chatId, userState.symbol, amount);
        this.userStates.delete(chatId);
      }
    });
  }

  private setupCallbackHandlers() {
    this.bot.on("callback_query", async (callbackQuery) => {
      const message = callbackQuery.message;
      const data = callbackQuery.data;

      if (!message || !data) return;

      const chatId = message.chat.id;

      // Answer callback to remove loading state (ignore errors for old queries)
      try {
        await this.bot.answerCallbackQuery(callbackQuery.id);
      } catch (error) {
        // Ignore errors for expired callback queries
        console.log("Callback query expired or invalid");
      }

      // Handle different callbacks
      if (data.startsWith("analyze_")) {
        const symbol = data.replace("analyze_", "");
        await this.analyzeSymbol(chatId, symbol);
      } else if (data.startsWith("price_")) {
        const symbol = data.replace("price_", "");
        await this.showPrice(chatId, symbol);
      } else if (data === "portfolio") {
        await this.showPortfolio(chatId);
      } else if (data === "alerts") {
        await this.showAlerts(chatId);
      } else if (data === "top_gainers") {
        await this.showTopGainers(chatId);
      } else if (data === "top_losers") {
        await this.showTopLosers(chatId);
      } else if (data === "help") {
        await this.sendHelpMessage(chatId);
      } else if (data.startsWith("add_portfolio_")) {
        const symbol = data.replace("add_portfolio_", "");
        this.userStates.set(chatId, { action: "add_portfolio", symbol });
        await this.bot.sendMessage(
          chatId,
          `💰 *Додати ${symbol} в портфоліо*\n\nСкільки ${symbol} у вас є?\n\nПриклад: 0.5\nАбо команда: /add ${symbol} <amount>`,
          { parse_mode: "Markdown" },
        );
      } else if (data.startsWith("remove_alert_")) {
        const alertId = data.replace("remove_alert_", "");
        await storage.removePriceAlert(alertId);
        await this.bot.sendMessage(chatId, "✅ Алерт успішно видалено!");
        await this.showAlerts(chatId);
      }
    });
  }

  private async addToPortfolio(chatId: number, symbol: string, amount: number) {
    try {
      // Verify the symbol exists
      const priceData = await cryptoApi.getPrice(symbol);

      if (!priceData) {
        await this.bot.sendMessage(chatId, `❌ Некоректний символ: ${symbol}`);
        return;
      }

      const holding: InsertPortfolioHolding = {
        chatId: chatId.toString(),
        symbol: symbol.toUpperCase(),
        amount,
      };

      await storage.addPortfolioHolding(holding);

      const value = amount * priceData.price;
      const message = `✅ *Додано до портфоліо!*\n\n${symbol}: ${amount} монет\n≈ $${value.toFixed(2)}\n\nВикористайте /portfolio щоб переглянути свої активи.`;

      await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Add to portfolio error:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Помилка при додаванні до портфоліо. Спробуйте ще раз.",
      );
    }
  }

  private async removeFromPortfolio(chatId: number, symbol: string) {
    try {
      const removed = await storage.removePortfolioHolding(
        chatId.toString(),
        symbol,
      );

      if (removed) {
        await this.bot.sendMessage(
          chatId,
          `✅ ${symbol} видалено з портфоліо.`,
        );
      } else {
        await this.bot.sendMessage(
          chatId,
          `❌ ${symbol} не знайдено у вашому портфоліо.`,
        );
      }
    } catch (error) {
      console.error("Remove from portfolio error:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Помилка при видаленні з портфоліо. Спробуйте ще раз.",
      );
    }
  }

  private async analyzeSymbol(chatId: number, symbol: string) {
    const statusMsg = await this.bot.sendMessage(
      chatId,
      "⏳ Аналіз ринкових даних...",
    );

    try {
      const priceData = await cryptoApi.getPrice(symbol);

      if (!priceData) {
        await this.bot.editMessageText(
          `❌ Не вдалося отримати дані для ${symbol}. Перевірте символ і спробуйте ще раз.`,
          { chat_id: chatId, message_id: statusMsg.message_id },
        );
        return;
      }

      await this.bot.editMessageText("🤖 AI аналізує...", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });

      const analysis = await aiAnalyst.analyzeCrypto(symbol, priceData);

      const emoji = priceData.changePercent24h >= 0 ? "🟢" : "🔴";
      const sign = priceData.changePercent24h >= 0 ? "+" : "";
      const sentimentEmoji =
        analysis.sentiment === "bullish"
          ? "📈"
          : analysis.sentiment === "bearish"
            ? "📉"
            : "➡️";

      let message = `📊 *АНАЛІЗ ${symbol}*\n\n`;
      message += `💰 *Поточна ціна:* $${cryptoApi.formatPrice(priceData.price)}\n`;
      message += `Зміна за 24h: ${emoji} ${sign}${priceData.changePercent24h.toFixed(2)}% (${sign}$${Math.abs(priceData.change24h).toFixed(2)})\n`;
      message += `Обсяг: ${cryptoApi.formatVolume(priceData.volume24h)}\n`;
      message += `Макс: $${cryptoApi.formatPrice(priceData.high24h)} | Мін: $${cryptoApi.formatPrice(priceData.low24h)}\n\n`;

      message += `${sentimentEmoji} *AI Аналіз*\n`;
      message += `${analysis.summary}\n\n`;

      message += `*Основні моменти:*\n`;
      analysis.keyPoints.forEach((point) => {
        message += `• ${point}\n`;
      });

      message += `\n💡 *Рекомендація:*\n${analysis.recommendation}\n\n`;
      message += `_Оновлено: ${new Date().toUTCString()}_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "🔄 Оновити", callback_data: `analyze_${symbol}` },
            { text: "💰 Перевірити ціну", callback_data: `price_${symbol}` },
          ],
          [
            {
              text: "➕ Додати в портфоліо",
              callback_data: `add_portfolio_${symbol}`,
            },
          ],
          [{ text: "🔙 Головне меню", callback_data: "help" }],
        ],
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Analysis error:", error);
      await this.bot.editMessageText(
        `❌ Сталася помилка при аналізі ${symbol}. Спробуйте пізніше.`,
        { chat_id: chatId, message_id: statusMsg.message_id },
      );
    }
  }

  private async showPrice(chatId: number, symbol: string) {
    const statusMsg = await this.bot.sendMessage(
      chatId,
      "⏳ Отримання даних про ціну...",
    );

    try {
      const priceData = await cryptoApi.getPrice(symbol);

      if (!priceData) {
        await this.bot.editMessageText(
          `❌ Не вдалося отримати ціну для ${symbol}. Перевірте символ і спробуйте ще раз.`,
          { chat_id: chatId, message_id: statusMsg.message_id },
        );
        return;
      }

      const emoji = priceData.changePercent24h >= 0 ? "🟢" : "🔴";
      const sign = priceData.changePercent24h >= 0 ? "+" : "";

      let message = `💰 *Інформація про ${symbol}*\n\n`;
      message += `*Ціна:* $${cryptoApi.formatPrice(priceData.price)}\n`;
      message += `Зміна за 24h: ${emoji} ${sign}${priceData.changePercent24h.toFixed(2)}% (${sign}$${Math.abs(priceData.change24h).toFixed(2)})\n`;
      message += `Обсяг: ${cryptoApi.formatVolume(priceData.volume24h)}\n`;
      message += `Макс: $${cryptoApi.formatPrice(priceData.high24h)}\n`;
      message += `Мін: $${cryptoApi.formatPrice(priceData.low24h)}\n\n`;
      message += `_Оновлено: ${new Date().toLocaleTimeString()} UTC_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "📊 Повний аналіз", callback_data: `analyze_${symbol}` },
            { text: "🔄 Оновити", callback_data: `price_${symbol}` },
          ],
          [{ text: "🔙 Головне меню", callback_data: "help" }],
        ],
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Price fetch error:", error);
      await this.bot.editMessageText(
        `❌ Сталася помилка при отриманні ціни для ${symbol}.`,
        { chat_id: chatId, message_id: statusMsg.message_id },
      );
    }
  }

  private async showPortfolio(chatId: number) {
    try {
      const holdings = await storage.getPortfolioHoldings(chatId.toString());

      if (holdings.length === 0) {
        const message = `🎯 *Ваше портфоліо*\n\n_Портфоліо порожнє_\n\nДодайте монети за допомогою:\n/add <COIN> <AMOUNT>\n\nПриклад: /add BTC 0.5`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: "📊 Аналіз BTC", callback_data: "analyze_BTC" },
              { text: "📊 Аналіз ETH", callback_data: "analyze_ETH" },
            ],
            [{ text: "🔙 Головне меню", callback_data: "help" }],
          ],
        };

        await this.bot.sendMessage(chatId, message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
        return;
      }

      const statusMsg = await this.bot.sendMessage(
        chatId,
        "⏳ Оновлення портфоліо...",
      );

      // Fetch current prices
      const symbols = holdings.map((h) => h.symbol);
      const prices = await cryptoApi.getMultiplePrices(symbols);

      let totalValue = 0;
      let message = `🎯 *Ваше портфоліо*\n\n`;

      holdings.forEach((holding) => {
        const priceData = prices.get(holding.symbol.toUpperCase());
        if (priceData) {
          const value = holding.amount * priceData.price;
          totalValue += value;
          const emoji = priceData.changePercent24h >= 0 ? "🟢" : "🔴";
          const sign = priceData.changePercent24h >= 0 ? "+" : "";

          message += `*${holding.symbol}:* ${holding.amount.toFixed(4)}\n`;
          message += `  ≈ $${value.toFixed(2)} ${emoji} ${sign}${priceData.changePercent24h.toFixed(2)}%\n\n`;
        }
      });

      message += `─────────────────\n`;
      message += `*Загальна вартість:* $${totalValue.toFixed(2)}\n\n`;
      message += `_Оновлено: ${new Date().toLocaleTimeString()} UTC_`;

      const keyboard = {
        inline_keyboard: [
          [{ text: "🔄 Оновити", callback_data: "portfolio" }],
          [{ text: "🔙 Головне меню", callback_data: "help" }],
        ],
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Portfolio error:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Помилка при завантаженні портфоліо. Спробуйте ще раз.",
      );
    }
  }

  private async showAlerts(chatId: number) {
    try {
      const alerts = await storage.getPriceAlerts(chatId.toString());

      let message = `🔔 *Ваші цінові алерти*\n\n`;

      if (alerts.length === 0) {
        message += `_Немає активних алертів_\n\nСтворіть алерт за допомогою:\n/alert <COIN> <PRICE> <above/below>\n\nПриклад: /alert BTC 50000 above`;

        await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
        return;
      }

      const keyboard: any = { inline_keyboard: [] };

      alerts.forEach((alert) => {
        const status = alert.triggered ? "✅ Спрацьовано" : "⏳ Активний";
        message += `*${alert.symbol}* ${alert.condition} $${cryptoApi.formatPrice(alert.targetPrice)}\n`;
        message += `Статус: ${status}\n\n`;

        if (!alert.triggered) {
          keyboard.inline_keyboard.push([
            {
              text: `❌ Видалити алерт ${alert.symbol}`,
              callback_data: `remove_alert_${alert.id}`,
            },
          ]);
        }
      });

      keyboard.inline_keyboard.push([
        { text: "🔙 Головне меню", callback_data: "help" },
      ]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Alerts error:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Помилка при завантаженні алертів. Спробуйте ще раз.",
      );
    }
  }

  private async createAlert(
    chatId: number,
    symbol: string,
    targetPrice: number,
    condition: string,
  ) {
    try {
      // Verify the symbol exists
      const priceData = await cryptoApi.getPrice(symbol);

      if (!priceData) {
        await this.bot.sendMessage(chatId, `❌ Некоректний символ: ${symbol}`);
        return;
      }

      const alert: InsertPriceAlert = {
        chatId: chatId.toString(),
        symbol: symbol.toUpperCase(),
        targetPrice,
        condition,
      };

      await storage.addPriceAlert(alert);

      const message = `✅ *Алерт успішно створено!*\n\n${symbol} ${condition} $${cryptoApi.formatPrice(targetPrice)}\n\nПоточна ціна: $${cryptoApi.formatPrice(priceData.price)}\n\nВи отримаєте повідомлення коли досягне ціль.`;

      await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Create alert error:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Помилка при створенні алерта. Спробуйте ще раз.",
      );
    }
  }

  private async showTopGainers(chatId: number) {
    const statusMsg = await this.bot.sendMessage(
      chatId,
      "⏳ Отримання топ-лідерів зростання...",
    );

    try {
      const gainers = await cryptoApi.getTopGainers(10);

      let message = `📈 *ТОП ЗРОСТАННЯ (24h)*\n\n`;

      gainers.forEach((coin, index) => {
        message += `${index + 1}. *${coin.symbol}* $${cryptoApi.formatPrice(coin.price)}\n`;
        message += `   🟢 +${coin.changePercent24h.toFixed(2)}%\n\n`;
      });

      message += `_Оновлено: ${new Date().toLocaleTimeString()} UTC_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "🔄 Оновити", callback_data: "top_gainers" },
            { text: "📉 Топ Лузери", callback_data: "top_losers" },
          ],
          [{ text: "🔙 Головне меню", callback_data: "help" }],
        ],
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Top gainers error:", error);
      await this.bot.editMessageText(
        "❌ Помилка при отриманні топ-лідерів зростання.",
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        },
      );
    }
  }

  private async showTopLosers(chatId: number) {
    const statusMsg = await this.bot.sendMessage(
      chatId,
      "⏳ Отримання топ-лозерів...",
    );

    try {
      const losers = await cryptoApi.getTopLosers(10);

      let message = `📉 *ТОП ЛОЗЕРИ (24h)*\n\n`;

      losers.forEach((coin, index) => {
        message += `${index + 1}. *${coin.symbol}* $${cryptoApi.formatPrice(coin.price)}\n`;
        message += `   🔴 ${coin.changePercent24h.toFixed(2)}%\n\n`;
      });

      message += `_Оновлено: ${new Date().toLocaleTimeString()} UTC_`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "🔄 Оновити", callback_data: "top_losers" },
            { text: "📈 Топ Зростання", callback_data: "top_gainers" },
          ],
          [{ text: "🔙 Головне меню", callback_data: "help" }],
        ],
      };

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Top losers error:", error);
      await this.bot.editMessageText("❌ Помилка при отриманні топ-лозерів.", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });
    }
  }

  private async showTopCoins(chatId: number) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "📈 Топ Зростання", callback_data: "top_gainers" },
          { text: "📉 Топ Лузери", callback_data: "top_losers" },
        ],
        [{ text: "🔙 Головне меню", callback_data: "help" }],
      ],
    };

    await this.bot.sendMessage(
      chatId,
      "📊 *Лідери Ринку*\n\nВиберіть що хочете побачити:",
      { parse_mode: "Markdown", reply_markup: keyboard },
    );
  }

  private async sendHelpMessage(chatId: number) {
    const message =
      `ℹ️ *Crypto Analyst AI Bot - Допомога*\n\n*Команди:*\n\n` +
      `/analyze <COIN> - Отримати AI-аналіз монети\n` +
      `Приклад: /analyze BTC\n\n` +
      `/price <COIN> - Поточна ціна та статистика за 24h\n` +
      `Приклад: /price ETH\n\n` +
      `/portfolio - Переглянути ваше портфоліо\n` +
      `/add <COIN> <AMOUNT> - Додати монету в портфоліо\n` +
      `Приклад: /add BTC 0.5\n\n` +
      `/remove <COIN> - Видалити монету з портфоліо\n\n` +
      `/alert <COIN> <PRICE> <above/below> - Встановити ціновий алерт\n` +
      `Приклад: /alert BTC 50000 above\n\n` +
      `/alerts - Переглянути ваші алерти\n` +
      `/top - Переглянути топ зростання та топ лузерів\n\n` +
      `*Функції:*\n` +
      `• Ціни в реальному часі з Binance\n` +
      `• AI-аналіз ринку (Google Gemini)\n` +
      `• Відстеження портфоліо\n` +
      `• Цінові алерти (перевірка кожні 2 хв)\n` +
      `• Відстеження топ монет\n\n` +
      `*Підтримувані монети:*\n` +
      `BTC, ETH, BNB, SOL, XRP, ADA, DOGE, DOT, MATIC та багато інших!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "📊 Аналіз BTC", callback_data: "analyze_BTC" },
          { text: "💰 Ціна BTC", callback_data: "price_BTC" },
        ],
        [
          { text: "📈 Топ Зростання", callback_data: "top_gainers" },
          { text: "📉 Топ Лузери", callback_data: "top_losers" },
        ],
      ],
    };

    await this.bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }

  public async sendAlert(
    chatId: string,
    symbol: string,
    currentPrice: number,
    targetPrice: number,
    condition: string,
  ) {
    try {
      const emoji = condition === "above" ? "🔼" : "🔽";
      const message =
        `🔔 *АЛЕРТ ЦІНИ!*\n\n` +
        `${symbol} перетнула вашу ціль!\n\n` +
        `Поточна: $${cryptoApi.formatPrice(currentPrice)}\n` +
        `Ваша ціль: $${cryptoApi.formatPrice(targetPrice)} (${condition})\n` +
        `${emoji} Ціль досягнута!`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "📊 Аналіз", callback_data: `analyze_${symbol}` },
            { text: "💰 Ціна", callback_data: `price_${symbol}` },
          ],
        ],
      };

      await this.bot.sendMessage(parseInt(chatId), message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Send alert error:", error);
    }
  }

  public start() {
    console.log("🤖 Crypto Analyst Bot працює...");
  }

  public stop() {
    this.bot.stopPolling();
  }
}
