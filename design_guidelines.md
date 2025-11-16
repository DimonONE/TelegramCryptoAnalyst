# Telegram Crypto Analyst AI Bot - Design Guidelines

## Critical Project Context
**This is a Telegram bot application, not a web UI.** All design occurs within Telegram's native messaging interface through text formatting, inline keyboards, and structured responses.

## Design Approach
**Reference-Based Approach:** Drawing from successful Telegram bots like @CryptoSignalsBot, @BinanceBot, and modern fintech apps for information hierarchy and user experience patterns.

---

## Message Formatting & Typography

### Text Hierarchy
- **Headers:** Use ALL CAPS + emoji for section headers (📊 MARKET ANALYSIS)
- **Primary info:** Bold text for key metrics and values
- **Secondary info:** Regular text for descriptions and context
- **Code/Data:** Monospace formatting for prices, percentages, timestamps
- **Emphasis:** Italic text for timestamps, updates, tips

### Emoji Strategy (Purposeful Usage)
- 🟢 Green circle: Positive changes, gains
- 🔴 Red circle: Negative changes, losses
- 📊 Chart: Analysis sections
- 💰 Money bag: Price information
- ⚡ Lightning: Alerts and notifications
- 📈 Chart up: Trending/gainers
- 📉 Chart down: Falling/losers
- 🎯 Target: Portfolio/goals
- 🔔 Bell: Alert settings
- ℹ️ Info: Help/explanations

---

## Inline Keyboard Layouts

### Primary Navigation (Main Menu)
```
[📊 Analyze] [💰 Prices]
[🎯 Portfolio] [🔔 Alerts]
[📈 Top Gainers] [📉 Top Losers]
[ℹ️ Help]
```

### Quick Actions (2-column grid)
- Use 2 buttons per row for primary actions
- Use 3 buttons per row for comparison options (BTC/ETH/BNB)
- Single full-width button for "Back to Menu" or primary CTA

### Coin Selection Pattern
```
[BTC] [ETH] [BNB] [SOL]
[ADA] [XRP] [DOT] [MATIC]
[⬅️ Back]
```

---

## Information Architecture

### Price Display Format
```
💰 BITCOIN (BTC)
Price: $45,234.56
24h Change: 🟢 +3.45% (+$1,510)
Volume: $28.5B
High: $46,100 | Low: $44,200

Last updated: 14:23 UTC
```

### Analysis Response Structure
1. **Header** (emoji + coin name)
2. **Current Metrics** (price, volume, 24h change)
3. **AI Analysis** (3-4 bullet points, concise)
4. **Recommendation** (bold, clear action)
5. **Timestamp** (italic, small)
6. **Action Buttons** (inline keyboard)

### Portfolio Display Format
```
🎯 YOUR PORTFOLIO

BTC: 0.05 ≈ $2,261.73
ETH: 1.2 ≈ $2,400.00
BNB: 10 ≈ $3,050.00
─────────────────
Total: $7,711.73
24h: 🟢 +$142.50 (+1.88%)

[➕ Add Coin] [➖ Remove Coin]
[📊 Analyze All] [🔙 Menu]
```

### Alert Notification Format
```
🔔 PRICE ALERT!

Bitcoin (BTC) has crossed $50,000!
Current: $50,124.50
Your target: $50,000
Change: 🟢 +$124.50

[View Analysis] [Edit Alert] [Dismiss]
```

---

## Spacing & Structure

### Message Padding
- Use line breaks to create visual breathing room
- Separator lines (─────) for distinct sections
- Empty line between header and content
- Empty line before action buttons

### Content Density
- Max 3-4 bullet points per analysis
- Keep responses under 300 words for readability
- Use tables/aligned text for multi-coin comparisons
- Progressive disclosure: summary first, details on request

---

## User Flow Patterns

### Command Structure
- `/start` → Welcome + main menu
- `/help` → Command list + quick tips
- `/analyze [COIN]` → AI analysis of specified coin
- `/price [COIN]` → Current price + 24h stats
- `/portfolio` → View holdings + total value
- `/alert [COIN] [PRICE]` → Set price alert
- `/top` → Top gainers/losers

### Response Time Indicators
- Show "⏳ Analyzing..." while fetching data
- Use "🔄 Updating prices..." for refresh operations
- "✅ Alert set successfully!" for confirmations

---

## Component Types

### Quick Stats Card (text-based)
- Compact format for multi-coin display
- 3-4 coins per message
- Bold coin name, regular price, colored change

### Comparison Table
```
Coin    Price      24h Change
BTC     $45,234    🟢 +3.45%
ETH     $2,400     🔴 -1.23%
BNB     $305       🟢 +5.67%
```

### Analysis Card
- Structured with clear sections
- Bullet points for key insights
- Call-to-action at bottom (buttons)

---

## Interaction Patterns

### Multi-Step Flows
1. User selects action (button)
2. Bot requests input (if needed)
3. Bot processes (shows loading)
4. Bot displays result + next actions

### Error States
- Clear error messages with emoji (⚠️)
- Suggest corrective action
- Provide "Try Again" button

### Loading States
- "⏳ Fetching data from Binance..."
- "🤖 AI is analyzing the market..."
- Keep under 3 seconds when possible

---

## Key Principles

1. **Scannability:** Use emoji, bold text, and spacing for quick reading
2. **Actionability:** Every message ends with clear next steps (buttons)
3. **Consistency:** Maintain format patterns across all responses
4. **Clarity:** Avoid jargon; explain metrics when needed
5. **Efficiency:** Minimize back-and-forth; anticipate user needs