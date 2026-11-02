# STM | Smart Structure Mastery (Buy/Sell Signals)

A Pine Script v5 TradingView indicator for market structure. It works out structure from a **Reference Candle Absorption state machine** and does not use pivot lengths (`ta.pivothigh` / `ta.pivotlow`) or fixed look-back windows (`ta.highest(50)`).

The chart and all three higher timeframes (MTF 1 / 2 / 3, through `request.security`) run the same engine (`f_engine()`). The table, trend filter and MTF zones therefore all use one definition of structure.

Files:

| File | What it is |
|---|---|
| [`STM_Smart_Structure_Mastery.pine`](./STM_Smart_Structure_Mastery.pine) | The indicator: structure, zones, signals, table and alerts |
| [`STM_SSM_Strategy_Tester.pine`](./STM_SSM_Strategy_Tester.pine) | **STM \| SSM Strategy Tester v1.61**: the same engine as a `strategy()` for backtesting and MT5 webhook automation (see [section 4](#4-stm--ssm-strategy-tester-v161)) |

---

## Installation

1. Open TradingView → **Pine Editor**.
2. Paste the full contents of `STM_Smart_Structure_Mastery.pine`.
3. Click **Save**, then **Add to chart**.
4. Set **MTF 1 ≤ MTF 2 ≤ MTF 3**, each at least the chart timeframe. Example: chart 1m, MTFs 3m / 5m / 15m.

---

## 1. Core algorithm

### 1.1 Reference Candle Absorption engine

The engine keeps one **Reference Candle** (`refH`, `refL`).

| Trend | New reference candle when | Inside bar (ignored) | Absorption (counter-move) |
|---|---|---|---|
| Uptrend (`trend = 1`) | `close > refH` | `refL ≤ close ≤ refH` | `close < refL` |
| Downtrend (`trend = -1`) | `close < refL` | `refL ≤ close ≤ refH` | `close > refH` |

A new reference candle clears the absorption flag and the pullback counter.

**Bootstrap:** the first bar is the first reference candle. The first close beyond it sets the initial trend. The opposite extreme seen so far becomes the first protected structure point.

### 1.2 Retracement start (structure confirmation)

During an impulse the engine tracks:

* `legH`: highest high of the bullish impulse (or `legL` for a bearish one).
* `oppExt`: lowest low since `legH` (highest high since `legL` for a bearish impulse).
* `pullback % = (legH − oppExt) / (legH − struct_low) × 100`. Bearish: `(oppExt − legL) / (struct_high − legL) × 100`.

| Retracement Condition | Retracement starts when… |
|---|---|
| Last Reference Candle Absorb | the reference candle is absorbed (close through `refL` in an uptrend, through `refH` in a downtrend) |
| 2 Candle Retracement Method | absorbed **and** ≥ 2 non-inside counter-trend candles. The absorbing candle is #1. Each later candle counts only if it **closes below the low of the previous counted candle** (downtrend: above its high). Candles that close inside that range are inside bars and are ignored. |
| Retrace confirm after 23.60% | absorbed **and** pullback % ≥ 23.6 |
| Use All Methods | absorbed **and** ≥ 2 counter candles **and** pullback % ≥ 23.6 |

When the retracement starts in an uptrend:

* `struct_high := legH`. This is the **Confirmed Structure High** (HH/LH).
* `struct_low` is locked to the **lowest point between the previous breakout and `struct_high`**. The engine tracks this as `seg`, covering every low up to and including the `legH` candle. If a wick (or, in Strong Structure Base mode, a close through a weak low) went below the old `struct_low` during the impulse, `struct_low` moves down to that point.
* The retracement extreme `pbExt` starts tracking the lowest low of the pullback.

A downtrend is the mirror image.

### 1.3 BOS / CHoCH (candle close only)

| Event | Uptrend | Downtrend |
|---|---|---|
| **BOS** | `close > struct_high` (only after the high is confirmed) | `close < struct_low` |
| **CHoCH** | `close < protected_low` | `close > protected_high` |

A wick through a level never counts as a break.

**Strong vs. weak BOS.** The engine measures the pullback that came before the break:

```
retracement_pct = pullback_depth / impulse_range × 100
  uptrend:   (struct_high − pbExt) / (struct_high − struct_low) × 100
  downtrend: (pbExt − struct_low)  / (struct_high − struct_low) × 100
```

* `≥ 50%`: label `BOS (Strong) - XX.X%`. The new swing low (uptrend) or swing high (downtrend) is marked **Strong**.
* `< 50%`: label `BOS (Weak) - XX.X%`. The new swing is marked **Weak**.

After a BOS the retracement extreme `pbExt` becomes the new `struct_low` (uptrend) or `struct_high` (downtrend). The new impulse leg's extreme is the **highest high since that pullback low** (`rb`), which also covers any liquidity wick above the old high. The breakout candle becomes the new reference candle.

**CHoCH / Fib Condition:**

| Mode | Protected level |
|---|---|
| Last Structure Base | the most recent confirmed swing low (uptrend) or swing high (downtrend) |
| Strong Structure Base | the most recent swing if it is Strong. If it is Weak (< 50%), the last **Strong** swing is used, so closing through a weak swing does **not** flip the trend. |

On a CHoCH, the top (or bottom) of the last leg becomes the new protected high (or low), marked Strong. The new leg starts at the lowest low since that top (or the highest high since that bottom). The BOS counter `bosSince` resets to 0.

The same setting also anchors the **Fibonacci** (section 1.10). In Strong Structure Base mode with a weak last swing, the Fib's 100% level is the last *strong* swing, not the weak one.

### 1.4 Liquidity hunt

```
struct high hunt: high > struct_high and close <= struct_high
struct low hunt:  low  < struct_low  and close >= struct_low
```

Each structure level can fire this at most once. When **Show Liquidity Hunt Labels** is on, the indicator draws a dashed line from the swing to the sweep candle with a `Liquidity Hunt` label.

### 1.5 Possible High / Possible Low (not confirmed)

While an uptrend is retracing, the engine tracks **bearish reference candles**:

* `close < bRefL` → that candle becomes the new bearish reference (`bRefH`, `bRefL`) and a confirmation is armed.
* `close > bRefH` while armed → the lowest point of the pullback (`pbExt`) is marked with a dot and the label **`Possible Low (Not Confirmed)`**.
* If price later trades **below** the last Possible Low before a BOS, tracking re-arms on that candle. The bearish chain continues, and the next close above the chain's high confirms the new, lower Possible Low. The text label moves to it; earlier dots stay on the chart, up to `poss_dots_keep`.
* A BOS or CHoCH removes the "Not Confirmed" text.

`Possible High` in a downtrend works the same way in reverse.

### 1.6 Signals

#### Possible Buy / Sell

A Possible Buy fires when a Possible Low confirms in an uptrend (Possible Sell: a Possible High in a downtrend) **and** all of these hold:

| Check | Rule |
|---|---|
| Fib depth | `poss_min_ret ≤ (struct_high − possLow)/(struct_high − fib_base)×100 ≤ poss_max_ret`, where `fib_base` is the protected low from **CHoCH / Fib Condition**. This is the same % as the drawn Fibonacci. |
| Cycle limit | signals in the current structure cycle `< max_poss_sigs`. A cycle resets on every BOS / CHoCH. |
| Mode (2nd+ signal in a cycle) | **Aggressive**: close better than the previous signal's close (lower for a buy, higher for a sell). **Precise**: close beyond the previous signal's wick (below its low for a buy, above its high for a sell). |
| Activation after CHoCH | **Immediate**, or **After First BOS** (`bosSince ≥ 1`) |
| MTF Trend Filter | optional, see 1.8 |
| MTF Zone Filter | optional, see 1.9 |

#### Retrace Buy / Sell

These fire on **the bar where the retracement start confirms**:

* bullish structure starts retracing → **Retrace Sell**
* bearish structure starts retracing → **Retrace Buy**

They require `current retracement % ≤ ret_max_pct` and the enabled trend and zone filters to pass, checked in the signal's direction.

### 1.7 Dynamic lot size

```
SL_Price       = zone bottom (buy) / zone top (sell)   if the zone filter for that signal is ON and a zone is found
               = struct_low  (buy) / struct_high (sell) otherwise
TP             = struct_high (buy) / struct_low  (sell)
price_distance = |close − SL_Price|
raw_lot        = sl_risk_usd / (price_distance × contract_size)
lot            = round(raw_lot, 2)                       ("2 Decimal Round Figure")
               = floor(raw_lot × 100.0 + 1e-9) / 100.0   ("2 Decimal Round Down")
if lot < min_lot → label shows "Lot < Min"
if lot > max_lot → lot = max_lot
```

Each signal label has a tooltip with **Entry, SL Price, TP, Retracement %, Zone info, Raw lot and Final lot**. The alert message carries the same text.

*Example:* XAUUSD, contract 100, risk $20, entry 2400.00, SL 2398.00. Distance 2.00 gives raw lot `20 / (2 × 100) = 0.10`, so the lot is **0.10**.

### 1.8 MTF trend filter

`t1`, `t2`, `t3` are the engine's trends on MTF 1/2/3, taken from the last **confirmed** higher-timeframe bar (`expr[1]` with `lookahead_on`, so they don't repaint).

| Mode | Buy passes when | Sell passes when |
|---|---|---|
| All 3 MTF Trends Align | t1 = t2 = t3 = +1 | t1 = t2 = t3 = −1 |
| Highest MTF + Any 1 Trend Align | t3 = +1 and (t1 = +1 or t2 = +1) | t3 = −1 and (t1 = −1 or t2 = −1) |

### 1.9 Zones and the MTF zone filter

**Supply / Demand detection.** *Zone Confirmation Candles* `N` sets how many candles must follow the base candle:

* **Demand.** The base candle sits `N` bars back. Its low is lower than every low of the next `N` candles and ≤ the low before it. At least one of those `N` candles closes above the base high (displacement). Zone = `[low, max(open, close)]` of the base.
* **Supply.** Mirror: `[min(open, close), high]` of the base.
* Detection Mode: Both / Trend wise (demand only in an uptrend, supply only in a downtrend) / Supply Only / Demand Only.

**FVG detection (3 candles).**

* Bullish FVG: `low > high[2]` → zone `[high[2], low]`, drawn from candle 1
* Bearish FVG: `high < low[2]` → zone `[high, low[2]]`, drawn from candle 1
* Detection Mode: Both / Trend wise / Supply FVG Only / Demand FVG Only.

**Zone management (applies to chart and MTF zones).**

* *Allow Overlapping*: when off, a new zone that overlaps an active zone of the same source and direction is skipped.
* *Delete After Break & Close*: a demand zone breaks on `close < bottom`, a supply zone on `close > top`. If this is on, the zone is deleted. If off, the zone stops extending and becomes inactive.
* *Structures to Show*: the maximum number of zones kept per timeframe per direction. The oldest is deleted first.
* The *Chart / MTF 1 / MTF 2 / MTF 3* check boxes choose which timeframes supply zones, both for display and for the filter.

**Filter.** A buy needs an active **demand** zone (or bullish FVG). A sell needs an active **supply** zone (or bearish FVG).

| Setting | Options |
|---|---|
| MTF Zone Filter Mode | Supply/Demand · FVG · Both. With Both, either family counts; S/D is checked first. |
| MTF Zone Activation | **Candle Close**: `bottom ≤ close ≤ top`. **Wick Touch**: `low ≤ top and high ≥ bottom`. |

### 1.10 Current structure Fibonacci

On the last bar the indicator draws dotted levels across the active leg. The leg runs from the **CHoCH / Fib Condition base** (the last swing, or the last strong swing) to the current extreme:

`0%, 23.6%, 38.2%, 50%, 61.8%, 70.5%, 79%, 100%`

```
uptrend:   price = top    − (top − bottom) × level   (0% = high, 100% = protected low)
downtrend: price = bottom + (top − bottom) × level   (0% = low,  100% = protected high)
```

### 1.11 Market structure table

| TF | Trend | Status | Ret % | High Price | Low Price |
|---|---|---|---|---|---|
| Chart | Bullish / Bearish | Bullish/Bearish BOS · CHoCH · Retracement | pullback % on the Fib base | current structure high (the running leg high until it is confirmed) | current structure low (likewise) |
| MTF 1 | … | … | … | … | … |
| MTF 2 | … | … | … | … | … |
| MTF 3 | … | … | … | … | … |

---

## 2. Settings reference

### MULTI TIMEFRAME MTF TREND SETTINGS
| Input | Default | Description |
|---|---|---|
| MTF 1 | 3 | Lowest higher timeframe |
| MTF 2 | 5 | Middle higher timeframe |
| MTF 3 | 15 | Highest higher timeframe |

### MARKET STRUCTURE SETTINGS
| Input | Default | Options |
|---|---|---|
| Retracement Condition | 2 Candle Retracement Method | Last Reference Candle Absorb · Retrace confirm after 23.60% · 2 Candle Retracement Method · Use All Methods |
| CHoCH / Fib Condition | Strong Structure Base | Strong Structure Base · Last Structure Base |
| Show Market Structure Table | true | |
| Table Position | Top Right | Top Right · Top Left · Bottom Right · Bottom Left · Middle Right · Bottom Center |
| Table Text Size | Small | Tiny · Small · Large |

### BUY/SELL SIGNAL SETTINGS
| Input | Default | Options |
|---|---|---|
| MTF Trend Mode | All 3 MTF Trends Align | All 3 MTF Trends Align · Highest MTF + Any 1 Trend Align |
| Signal Activation After CHoCH | Immediate | Immediate · After First BOS |
| MTF Zone Filter Mode | Supply/Demand | Supply/Demand · FVG · Both |
| MTF Zone Activation Method | Candle Close | Candle Close · Wick Touch |

### POSSIBLE BUY/SELL SIGNAL SETTINGS
| Input | Default |
|---|---|
| Show Possible Buy/Sell Signals | true |
| Use MTF Zone Filter for Possible Signals | false |
| Use MTF Trend Filter for Possible Signals | true |
| Possible Buy/Sell Signal Mode | Aggressive (Aggressive · Precise) |
| Possible Buy/Sell Min Retracement % | 60 |
| Possible Buy/Sell Max Retracement % | 90 |
| Max Possible Signals Per Structure Cycle | 1 (1–10) |

### RETRACE BUY/SELL SIGNAL SETTINGS
| Input | Default |
|---|---|
| Show Retrace Buy/Sell Signals | false |
| Use MTF Zone Filter for Retrace Signals | true |
| Use MTF Trend Filter for Retrace Signals | true |
| Retrace Buy/Sell Max Retracement % | 40 |

### SUPPLY / DEMAND ZONES · SUPPLY/DEMAND MTF ZONE
| Input | Default |
|---|---|
| Show Supply/Demand Zones | true |
| Zone Confirmation Candles | 5 (1–100) |
| Detection Mode | Both Supply/Demand |
| Supply/Demand Structures to Show | 5 |
| Allow Overlapping Zones | false |
| Delete Zone After Break & Close | true |
| Chart / MTF 1 / MTF 2 / MTF 3 Zones | false / false / false / **true** |

### FAIR VALUE GAP FVG ZONES · FVG MTF ZONE
| Input | Default |
|---|---|
| Show FVG Zones | false |
| Detection Mode | Both FVG |
| FVG Structures to Show | 5 |
| Allow Overlapping FVG Zones | false |
| Delete FVG After Break & Close | true |
| Chart / MTF 1 / MTF 2 / MTF 3 Zones | false / false / false / **true** |

### ALERT SETTINGS
All alerts use `alert(..., alert.freq_once_per_bar_close)`. To receive them, create one alert on the indicator with **"Any alert() function call"**.

| Input | Default | Fires on |
|---|---|---|
| Enable BOS / CHoCH Alerts | false | every BOS and CHoCH, with strength and % |
| Enable Retrace Start Alerts | false | retracement start |
| Enable Possible High/Low Alerts | false | each Possible High/Low confirmation |
| Enable Possible Buy/Sell Signal Alerts | **true** | Possible Buy / Sell, with the full trade plan |
| Enable Retrace Buy/Sell Signal Alerts | **true** | Retrace Buy / Sell, with the full trade plan |
| Enable Supply/Demand Zone Alerts | false | a new S/D zone accepted on any enabled TF |
| Enable FVG Zone Alerts | false | a new FVG accepted on any enabled TF |
| Enable Liquidity Hunt Alerts | false | a liquidity sweep |
| Enable MTF Trend Alignment Alerts | false | all 3 MTFs turn aligned bullish or bearish |

### LOT SIZE CALCULATION
| Input | Default |
|---|---|
| Contract Size Per 1 Lot | 100 |
| SL Risk in USD | 20 |
| Minimum Lot | 0.01 |
| Maximum Lot | 0.1 |
| Dynamic Lot Rounding Method | 2 Decimal Round Figure (or 2 Decimal Round Down) |

### DISPLAY SETTINGS · HISTORY LIMITS
| Input | Default |
|---|---|
| Show HH / HL / LH / LL Labels | false |
| Show Possible High/Low Labels | true |
| Show Liquidity Hunt Labels | false |
| Show BOS Labels | true |
| Show CHoCH Labels | true |
| Show Current Structure Fibonacci | true |
| Show Fibonacci Labels | true |
| HH/HL Labels to Keep | 100 |
| BOS/CHoCH Drawings to Keep | 200 (also caps liquidity drawings and signal labels) |
| Possible High/Low Dots to Keep | 100 |

---

## 3. Implementation notes

* **No drawings inside the engine.** `f_engine()` only returns numbers and booleans, a 41-element tuple, so it can run inside `request.security()`. All lines, labels and boxes are created on the chart from the engine's per-bar events.
* **Non-repainting MTF.** `f_mtf()` returns the engine outputs shifted by `[1]` and is requested with `lookahead = barmerge.lookahead_on`, so every MTF value comes from a closed higher-timeframe bar. MTF zone events are de-duplicated by their origin time, so each zone is added once even though the value stays the same for the whole higher-timeframe bar.
* **Cleanup of drawings.** Every drawing goes into a bounded array (`bosLines`, `bosLabels`, `liqLines`, `liqLabels`, `hlLabels`, `possDots`, `sigLabels`, zone arrays). When an array exceeds its limit, its oldest object is deleted. Fibonacci objects are deleted and redrawn on the last bar only.
* **Timeframes.** MTFs should be greater than or equal to the chart timeframe. A lower MTF returns only its last intrabar value.
* **Two retracement percentages.** `Retracement % (Last Base)` is measured against the last structure swing; the 23.6% trigger, BOS strength and Retrace signals use it. `Retracement % (Fib Base)` is measured against the CHoCH / Fib Condition base; the Fibonacci, Possible signals and the table use it. In Last Structure Base mode, or when the last swing is strong, the two are identical.
* **Wick sweeps don't break structure.** A wick below `struct_low` that closes back above is a liquidity hunt, so a pullback can read slightly above 100% without a CHoCH.
* **Data Window.** Structure High, Structure Low, both retracement percentages and Chart Trend appear in the Data Window for inspection.
* **Verification.** The structure engine was ported line by line to Python and run on 5 × 20,000 synthetic bars, across every Retracement Condition × CHoCH Condition combination. Invariants checked on every bar: no close beyond a structure level without a BOS/CHoCH, non-negative BOS and Possible percentages, leg extremes always contain the current bar, and the struct high always above the struct low when a retracement starts.

## 4. STM | SSM Strategy Tester v1.61

`STM_SSM_Strategy_Tester.pine` is a Pine v5 **strategy**. It copies the indicator's structure engine, zones, MTF filters and signal rules unchanged, then turns the signals into trades in TradingView's Strategy Tester. Every trade can also be sent as a JSON webhook to an MT5 bridge.

### 4.1 Installation

1. Pine Editor → paste `STM_SSM_Strategy_Tester.pine` → **Save** → **Add to chart**.
2. Use the chart timeframe the indicator uses (for example XAUUSD 1m). For more than a few weeks of 1m data, turn on **Deep Backtesting** in the Strategy Tester.
3. **Properties** tab: set *Initial capital* (default 10,000 USD). Optionally set commission and slippage for your broker; both default to 0.

### 4.2 Which signals are traded

| Signal | Traded when |
|---|---|
| Possible Buy / Sell | **Show Possible Buy/Sell Signals** is ON (default ON) |
| Retrace Buy / Sell | **Show Retrace Buy/Sell Signals** is ON (default OFF) |

All the indicator filters still apply: Fib range, max signals per cycle, Aggressive / Precise, Signal Activation After CHoCH, MTF trend filter and MTF zone filter. On top of those, a signal is traded only when:

* its direction is allowed (**Trade Buy Signals** / **Trade Sell Signals**),
* the candle is inside an enabled trading session and is not the session's last candle,
* **One Trade At A Time** is OFF, or no trade is open,
* the SL is on the correct side of entry, the TP is beyond entry, and the Max SL rule doesn't skip it.

Orders are processed **on the signal candle's close** (`process_orders_on_close = true`), the same moment an EA reacts to a closed candle.

### 4.3 Entry, SL and TP

```
entry = close of the signal candle
SL    = zone bottom / top  (if that signal's zone filter is ON and a zone was found)
      = struct_low / struct_high otherwise
        then moved SL Buffer Points further away:  SL = SL - dir x sl_buffer x point_size
TP    = struct_high (buy) / struct_low (sell)
        then pulled TP Buffer Points closer:       TP = TP - dir x tp_buffer x point_size
```

**Max SL Mode** (`SL points = |entry - SL| / Point Size`):

| Mode | Effect when SL points > Max SL Points |
|---|---|
| OFF | nothing |
| Skip Trade | the signal is not traded |
| Limit SL | SL is moved to `entry - dir x Max SL Points x Point Size` |

### 4.4 Profit Lock (break-even in profit)

```
TP distance = |TP - entry|
trigger     : price has moved >= Trigger % x TP distance in favour (uses the candle high for buys, low for sells)
action      : SL -> entry + dir x (Move SL to %) x TP distance          (only if that is better than the current SL)
```

With the defaults (40% / 10%): buy at 2400.00 with TP 2410.00 → once price reaches 2404.00, the SL moves to 2401.00. The new stop applies from the next candle, and a `MODIFY` webhook is sent.

### 4.5 Trading sessions

| Session | Default | Time zone | Window |
|---|---|---|---|
| Asia | off | GMT +5 | 09:00–10:00 |
| London | off | Auto (London) | 03:00–04:00 |
| NY | **on** | Auto (New York) | 08:15–16:00 (= 17:15–01:00 Pakistan time) |

* **Auto (...)** time zones follow daylight saving (`America/New_York`, `Europe/London`, `Asia/Tokyo`). `GMT ±x` is fixed.
* Windows may cross midnight, for example `1715-0100`.
* **Untick all three sessions to trade 24 hours.** Session settings are ignored on daily and higher charts.
* **Close All Trades When Trading Session Ends:** the engine detects the **last candle** of each enabled session (the candle whose close time reaches the session end) and closes every open trade at that candle's close. This keeps trades out of the overnight and weekend gaps. If the market closes before the session end, the first candle outside the session closes them instead. Sessions are handled independently, so the end of one enabled session closes all trades even if another session is still open.

### 4.6 Lot size

| Lot Size Mode | Lot |
|---|---|
| Dynamic Lot Size | `raw = SL Risk USD / (|entry - SL| x Contract Size)`, rounded (Round Figure or Round Down, 2 decimals), capped at **Maximum Lot**. Below **Minimum Lot**: *Use Minimum Lot* (default; risk ends up a little above target) or *Skip Trade*. |
| Fixed Lot Size | **Fixed Lot Size** on every trade |

The Strategy Tester order quantity is `lot x Contract Size / syminfo.pointvalue` units. On XAUUSD (point value 1), 0.05 lot = 5 oz, so a 1.00 move = 5 USD, the same P&L as MT5.

| Account | Suggested settings from the video |
|---|---|
| 1,000 USD | SL Risk 15, Max Lot 0.05 |
| 10,000 USD (0.5%) | SL Risk 50, Max Lot 0.05 |
| 10,000 USD (1%) | SL Risk 100, Max Lot 1.00 |

### 4.7 RR plot

* Green box: entry → TP. Red box: entry → SL. The red box turns **blue** and moves when the profit lock shifts the SL.
* The RR label shows the signal, `RR 1:x.xx`, lot and USD risk. When the trade closes, the label adds the result (`TP`, `SL`, `Profit Lock`, `Session End` or `Closed`), the USD P&L and the **R multiple**.
* **RR Trades To Keep** limits how many finished trades stay drawn (default 60).

### 4.8 Webhook automation (MT5 bridge)

1. **Create Alert** → Condition: *STM SSM Strategy Tester* → **Order fills and alert() function calls**.
2. Message: `{{strategy.order.alert_message}}`
3. Notifications → **Webhook URL**: your MT5 bridge endpoint.

**Magic number** = `Magic Base x 10 + signal type`, where type 1 = Possible and 2 = Retrace. With the default 786: **7861** / **7862**.

JSON sent (prices use the symbol's tick decimals):

```json
{"action":"BUY","symbol":"XAUUSD","lot":0.05,"sl":2398.50,"tp":2410.20,"magic":7861,"id":"STM#12","comment":"Possible Buy"}
{"action":"MODIFY","symbol":"XAUUSD","magic":7861,"id":"STM#12","sl":2401.00,"tp":2410.20}
{"action":"CLOSE","symbol":"XAUUSD","magic":7861,"id":"STM#12"}
{"action":"CLOSE_ALL","symbol":"XAUUSD","magic_base":786}
```

| Action | Sent when |
|---|---|
| BUY / SELL | entry order fills |
| MODIFY | the profit lock moves the SL (sent through `alert()`) |
| CLOSE | that trade's SL / TP / locked SL fills in the tester. MT5 normally closes it first on the server-side SL/TP, so treat this as a safety close. |
| CLOSE_ALL | session end |

**Show Automation Note** draws these setup steps on the chart.

### 4.9 Strategy settings reference

| Group | Input | Default |
|---|---|---|
| TRADING SESSIONS - STRATEGY TESTER | Asia / London / NY Session | off / off / **on** |
| | Asia / London / NY Time Zone | GMT +5 / Auto (London) / Auto (New York) |
| | Asia / London / NY Trading Session | 09:00–10:00 / 03:00–04:00 / 08:15–16:00 |
| | Close All Trades When Trading Session Ends | on |
| STRATEGY RISK & EXECUTION SETTINGS | Trade Buy Signals / Trade Sell Signals | on / on |
| | One Trade At A Time | on |
| | Point Size | 0.01 |
| | TP Buffer Points / SL Buffer Points | 0 / 0 |
| | Max SL Mode / Max SL Points | OFF / 10000 |
| | Use Profit Lock | on |
| | Profit Lock Trigger (% of TP Distance) | 40 |
| | Move SL to (% of TP Distance) | 10 |
| STRATEGY RR PLOT SETTINGS | Show RR Plot / Show RR Label | on / on |
| | RR Trades To Keep | 60 |
| TRADING SYMBOL & MAGIC NUMBER | Trading Symbol | XAUUSD |
| | Magic Base (2-3 digits) | 786 |
| LOT SIZE MANAGEMENT | Lot Size Mode | Dynamic Lot Size |
| | Contract Size Per 1 Lot | 100 |
| DYNAMIC LOT SIZE SETTINGS | SL Risk in USD | 50 |
| | Minimum Lot / Maximum Lot | 0.01 / 0.05 |
| | Dynamic Lot Rounding Method | 2 Decimal Round Figure |
| | When Lot < Minimum | Use Minimum Lot |
| FIXED LOT SIZE SETTINGS | Fixed Lot Size | 0.02 |
| DISPLAY & DEBUG SETTINGS | Show Automation Note | off |

Groups 1–7 (MTF, structure, signals, S/D and FVG zones) and Display / History are identical to the indicator. The strategy's only different default is FVG **MTF 3 Zones = off**, matching the reference settings. The indicator's alert and lot-size groups are replaced by the strategy groups above, so no plain-text alerts can reach the webhook.

### 4.10 Notes

* **TradingView is netting.** With *One Trade At A Time* OFF, same-direction signals stack (up to 10), but an opposite signal reverses the position. An MT5 hedging account can hold both directions, so results can differ in that mode.
* **Margin checks are off** (`margin_long = margin_short = 0`) to emulate a leveraged CFD account.
* Backtest results depend on the data range, commission, slippage and spread. They are not a guarantee of live EA performance.

> Trading involves risk. This indicator is an analytical tool. It does not give financial advice, and its signals are not guaranteed outcomes.
