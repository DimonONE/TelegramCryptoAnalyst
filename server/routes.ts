import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { CryptoAnalystBot } from "./bot/telegram";
import { AlertMonitor } from "./bot/alertMonitor";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      message: 'Crypto Analyst Bot is running',
      timestamp: new Date().toISOString(),
      botEnabled: !!process.env.TELEGRAM_BOT_TOKEN
    });
  });

  // Initialize Telegram bot only if token is available
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const bot = new CryptoAnalystBot();
      bot.start();

      // Initialize alert monitoring
      const alertMonitor = new AlertMonitor(bot);
      alertMonitor.start();

      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully...');
        bot.stop();
        alertMonitor.stop();
      });
    } catch (error) {
      console.error('Failed to start Telegram bot:', error);
    }
  } else {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not found - bot will not start');
    console.warn('Please add your Telegram bot token to environment secrets');
  }

  const httpServer = createServer(app);

  return httpServer;
}
