/* Client-side only. No network calls, no tracking. */
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function num(el) {
    if (!el) return NaN;
    var v = String(el.value || "").replace(/,/g, "").trim();
    if (v === "") return NaN;
    return Number(v);
  }
  function fmt(n, d) {
    if (!isFinite(n)) return "—";
    var digits = (d == null) ? 4 : d;
    if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: Math.min(digits, 2) });
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }
  function fmtPct(n, d) {
    if (!isFinite(n)) return "—";
    return fmt(n, d == null ? 4 : d) + "%";
  }
  function showError(box, msg) {
    var err = box.querySelector(".calc-error");
    var res = box.querySelector(".calc-result");
    if (err) { err.hidden = !msg; err.textContent = msg || ""; }
    if (res && msg) res.hidden = true;
  }
  function showResult(box, html) {
    var err = box.querySelector(".calc-error");
    var res = box.querySelector(".calc-result");
    if (err) { err.hidden = true; err.textContent = ""; }
    if (res) { res.hidden = false; res.innerHTML = html; }
  }

  function tradingFees(form, box) {
    var mode = ($("select[name=mode]", form) || {}).value || "cex";
    var notional = num($("[name=notional]", form));
    if (!(notional > 0)) return showError(box, "Enter a trade size greater than zero.");
    var trips = num($("[name=trips]", form));
    if (!isFinite(trips) || trips < 1) trips = 1;

    if (mode === "cex") {
      var maker = num($("[name=maker]", form));
      var taker = num($("[name=taker]", form));
      if (!isFinite(maker) || !isFinite(taker) || maker < 0 || taker < 0) {
        return showError(box, "Enter maker and taker fee rates as percentages (0 is allowed).");
      }
      var buy = ($("[name=buy_side]", form) || {}).value || "taker";
      var sell = ($("[name=sell_side]", form) || {}).value || "taker";
      var buyRate = (buy === "maker" ? maker : taker) / 100;
      var sellRate = (sell === "maker" ? maker : taker) / 100;
      var oneRt = notional * buyRate + notional * sellRate;
      var total = oneRt * trips;
      var pct = (oneRt / notional) * 100;
      showResult(box,
        "<p class=\"small muted\">Result (illustration only)</p>" +
        "<p class=\"big\"><strong>" + fmt(total, 4) + "</strong> in fees for " + fmt(trips, 0) + " round trip" + (trips === 1 ? "" : "s") + "</p>" +
        "<dl>" +
        "<div><dt>Buy fee (" + buy + " " + fmtPct(buyRate * 100, 4) + ")</dt><dd>" + fmt(notional * buyRate, 4) + "</dd></div>" +
        "<div><dt>Sell fee (" + sell + " " + fmtPct(sellRate * 100, 4) + ")</dt><dd>" + fmt(notional * sellRate, 4) + "</dd></div>" +
        "<div><dt>One round trip</dt><dd>" + fmt(oneRt, 4) + " (" + fmtPct(pct, 4) + " of size)</dd></div>" +
        "<div><dt>Trade size used</dt><dd>" + fmt(notional, 4) + "</dd></div>" +
        "</dl>" +
        "<p class=\"small muted\">Fee = size × rate, charged once to open and once to close. VIP discounts, token discounts, spread and funding are not included.</p>"
      );
    } else {
      var venue = num($("[name=venue_fee]", form));
      var proto = num($("[name=protocol_fee]", form));
      var prio = num($("[name=priority]", form));
      var tip = num($("[name=tip]", form));
      if (!isFinite(venue) || venue < 0 || !isFinite(proto) || proto < 0) {
        return showError(box, "Enter venue and protocol/curve fees as percentages (0 is allowed).");
      }
      if (!isFinite(prio) || prio < 0) prio = 0;
      if (!isFinite(tip) || tip < 0) tip = 0;
      var pctRate = (venue + proto) / 100;
      var oneSidePct = notional * pctRate;
      var oneSideFixed = prio + tip;
      var oneRt = 2 * (oneSidePct + oneSideFixed);
      var total = oneRt * trips;
      var pctOfSize = notional > 0 ? (oneRt / notional) * 100 : 0;
      showResult(box,
        "<p class=\"small muted\">Result (illustration only)</p>" +
        "<p class=\"big\"><strong>" + fmt(total, 6) + "</strong> in fees for " + fmt(trips, 0) + " round trip" + (trips === 1 ? "" : "s") + "</p>" +
        "<dl>" +
        "<div><dt>Percentage fees each way</dt><dd>" + fmt(oneSidePct, 6) + " (" + fmtPct(venue + proto, 4) + ")</dd></div>" +
        "<div><dt>Priority fee + tip each way</dt><dd>" + fmt(oneSideFixed, 6) + "</dd></div>" +
        "<div><dt>One buy + one sell</dt><dd>" + fmt(oneRt, 6) + " (" + fmtPct(pctOfSize, 4) + " of size)</dd></div>" +
        "<div><dt>Trade size used</dt><dd>" + fmt(notional, 6) + "</dd></div>" +
        "</dl>" +
        "<p class=\"small muted\">Percentage fees are applied to the size you entered, once on the buy and once on the sell. Fixed priority fees and tips are added on each side. Slippage, token-account rent and third-party bridge fees are not included.</p>"
      );
    }
  }

  function positionSize(form, box) {
    var account = num($("[name=account]", form));
    var riskPct = num($("[name=risk_pct]", form));
    var entry = num($("[name=entry]", form));
    var stop = num($("[name=stop]", form));
    var feePct = num($("[name=fee_pct]", form));
    if (!(account > 0)) return showError(box, "Enter an account size greater than zero.");
    if (!(riskPct > 0) || riskPct >= 100) return showError(box, "Enter a risk percentage between 0 and 100, not including 0 or 100.");
    if (!(entry > 0) || !(stop > 0)) return showError(box, "Enter entry and stop prices greater than zero.");
    if (entry === stop) return showError(box, "Entry and stop must be different.");
    if (!isFinite(feePct) || feePct < 0) feePct = 0;
    var riskAmt = account * (riskPct / 100);
    var move = Math.abs(entry - stop);
    var feePerUnit = entry * (feePct / 100) + stop * (feePct / 100);
    var denom = move + feePerUnit;
    if (!(denom > 0)) return showError(box, "The stop distance plus fees must be greater than zero.");
    var units = riskAmt / denom;
    var value = units * entry;
    var side = entry > stop ? "long (stop below entry)" : "short (stop above entry)";
    var stopPct = (move / entry) * 100;
    showResult(box,
      "<p class=\"small muted\">Result (illustration only) · assumed " + side + "</p>" +
      "<p class=\"big\"><strong>" + fmt(units, 6) + "</strong> units · position value " + fmt(value, 2) + "</p>" +
      "<dl>" +
      "<div><dt>Cash at risk</dt><dd>" + fmt(riskAmt, 4) + " (" + fmtPct(riskPct, 4) + " of account)</dd></div>" +
      "<div><dt>Stop distance</dt><dd>" + fmt(move, 6) + " (" + fmtPct(stopPct, 4) + ")</dd></div>" +
      "<div><dt>Estimated fees per unit</dt><dd>" + fmt(feePerUnit, 6) + "</dd></div>" +
      "<div><dt>Account</dt><dd>" + fmt(account, 2) + "</dd></div>" +
      "</dl>" +
      "<p class=\"small muted\">Units = cash at risk ÷ (price move to the stop + estimated entry and exit fees per unit). This does not include slippage or liquidation risk.</p>"
    );
  }

  function liquidation(form, box) {
    var side = ($("[name=side]", form) || {}).value || "long";
    var entry = num($("[name=entry]", form));
    var lev = num($("[name=leverage]", form));
    var mmrPct = num($("[name=mmr]", form));
    if (!(entry > 0)) return showError(box, "Enter an entry price greater than zero.");
    if (!(lev > 1)) return showError(box, "Enter leverage greater than 1.");
    if (!isFinite(mmrPct) || mmrPct < 0) return showError(box, "Enter a maintenance margin rate of 0 or more.");
    var imr = 1 / lev;
    var mmr = mmrPct / 100;
    if (mmr >= imr) {
      return showError(box, "Maintenance margin must be lower than the initial margin rate (1 ÷ leverage). At " + fmt(lev, 2) + "×, initial margin is " + fmtPct(imr * 100, 4) + ".");
    }
    var liq;
    if (side === "long") liq = entry * (1 - imr + mmr);
    else liq = entry * (1 + imr - mmr);
    if (liq <= 0) return showError(box, "The inputs produce a liquidation price at or below zero. Check leverage and maintenance margin.");
    var move = Math.abs(liq - entry);
    var movePct = (move / entry) * 100;
    var dir = side === "long" ? "below" : "above";
    showResult(box,
      "<p class=\"small muted\">Result (simplified isolated-margin model)</p>" +
      "<p class=\"big\"><strong>" + fmt(liq, 6) + "</strong> estimated liquidation price</p>" +
      "<dl>" +
      "<div><dt>Side</dt><dd>" + side + "</dd></div>" +
      "<div><dt>Entry</dt><dd>" + fmt(entry, 6) + "</dd></div>" +
      "<div><dt>Move to liquidation</dt><dd>" + fmt(move, 6) + " " + dir + " entry (" + fmtPct(movePct, 4) + ")</dd></div>" +
      "<div><dt>Initial margin rate</dt><dd>" + fmtPct(imr * 100, 4) + " (1 ÷ " + fmt(lev, 2) + ")</dd></div>" +
      "<div><dt>Maintenance margin</dt><dd>" + fmtPct(mmrPct, 4) + "</dd></div>" +
      "</dl>" +
      "<p class=\"small muted\">Long: entry × (1 − 1/leverage + maintenance). Short: entry × (1 + 1/leverage − maintenance). This ignores fees, funding, isolated-wallet adjustments and exchange maintenance amounts, so a live venue price will differ.</p>"
    );
  }

  function profitLoss(form, box) {
    var side = ($("[name=side]", form) || {}).value || "long";
    var entry = num($("[name=entry]", form));
    var exit = num($("[name=exit]", form));
    var qty = num($("[name=qty]", form));
    var entryFee = num($("[name=entry_fee]", form));
    var exitFee = num($("[name=exit_fee]", form));
    var flat = num($("[name=flat_fees]", form));
    if (!(entry > 0) || !(exit >= 0)) return showError(box, "Enter an entry price greater than zero and an exit price of zero or more.");
    if (!(qty > 0)) return showError(box, "Enter a quantity greater than zero.");
    if (!isFinite(entryFee) || entryFee < 0) entryFee = 0;
    if (!isFinite(exitFee) || exitFee < 0) exitFee = 0;
    if (!isFinite(flat) || flat < 0) flat = 0;
    var ef = entryFee / 100, xf = exitFee / 100;
    if (xf >= 1) return showError(box, "The exit fee must be below 100%.");
    var entryNotional = entry * qty;
    var exitNotional = exit * qty;
    var fees = entryNotional * ef + exitNotional * xf + flat;
    var gross = side === "long" ? (exit - entry) * qty : (entry - exit) * qty;
    var net = gross - fees;
    var netPct = entryNotional > 0 ? (net / entryNotional) * 100 : 0;
    var be;
    if (side === "long") {
      be = (entryNotional * (1 + ef) + flat) / (qty * (1 - xf));
    } else {
      var numer = entryNotional * (1 - ef) - flat;
      be = numer / (qty * (1 + xf));
    }
    showResult(box,
      "<p class=\"small muted\">Result (illustration only) · " + side + "</p>" +
      "<p class=\"big\"><strong>" + (net >= 0 ? "+" : "") + fmt(net, 4) + "</strong> net P/L (" + (netPct >= 0 ? "+" : "") + fmtPct(netPct, 4) + " of entry value)</p>" +
      "<dl>" +
      "<div><dt>Gross P/L before fees</dt><dd>" + (gross >= 0 ? "+" : "") + fmt(gross, 4) + "</dd></div>" +
      "<div><dt>Estimated fees</dt><dd>" + fmt(fees, 4) + "</dd></div>" +
      "<div><dt>Breakeven exit price</dt><dd>" + fmt(be, 6) + "</dd></div>" +
      "<div><dt>Entry value</dt><dd>" + fmt(entryNotional, 4) + "</dd></div>" +
      "</dl>" +
      "<p class=\"small muted\">Net P/L = price change × quantity − percentage fees on the entry and exit notionals − any flat fees. Funding and slippage are not included.</p>"
    );
  }

  function applyPreset(form, preset) {
    if (!preset) return;
    Object.keys(preset).forEach(function (k) {
      if (k === "label") return;
      var el = form.querySelector("[name=\"" + k + "\"]");
      if (!el) return;
      el.value = preset[k];
    });
    var modeEl = form.querySelector("[name=mode]");
    if (modeEl && preset.mode) {
      modeEl.value = preset.mode;
      toggleMode(form);
    }
  }

  function toggleMode(form) {
    var mode = (form.querySelector("[name=mode]") || {}).value || "cex";
    $all("[data-mode]", form).forEach(function (row) {
      var ok = row.getAttribute("data-mode") === mode;
      row.hidden = !ok;
      $all("input, select", row).forEach(function (el) { el.disabled = !ok; });
    });
  }

  function bind(form) {
    var kind = form.getAttribute("data-calc");
    var box = form.closest(".calc") || form.parentElement;
    var run = {
      "trading-fees": tradingFees,
      "position-size": positionSize,
      "liquidation": liquidation,
      "profit-loss": profitLoss
    }[kind];
    if (!run) return;
    if (kind === "trading-fees") {
      toggleMode(form);
      var modeEl = form.querySelector("[name=mode]");
      if (modeEl) modeEl.addEventListener("change", function () { toggleMode(form); });
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      run(form, box);
    });
    $all("[data-preset]", form).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var raw = btn.getAttribute("data-preset");
        try { applyPreset(form, JSON.parse(raw)); } catch (err) {}
        run(form, box);
      });
    });
  }

  $all("form[data-calc]").forEach(bind);
})();
