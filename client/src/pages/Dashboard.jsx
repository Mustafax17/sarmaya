import { useMemo, useState } from "react";
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Wallet, LineChart as LineChartIcon, Sparkles, ArrowUpRight, AlertTriangle, PiggyBank, Percent, HandCoins, ArrowLeftRight } from "lucide-react";
import { fmtMoney, fmtCompact, fmtDate, toMajor } from "../lib/format.js";
import { spendStats, monthlyTotals, momSpending, obligationsSum, monthComparison } from "../lib/stats.js";
import { catColor, BRAND, CHART_SERIES } from "../theme.js";
import { catIcon } from "../lib/icons.js";
import { Card, EmptyState, Loading, Btn, Bar, SelfReportTag, Explain } from "../components/ui.jsx";
import StatCard from "../components/StatCard.jsx";
import { PageHeader, chartTooltip, gridProps, axisProps } from "../components/PageHeader.jsx";

export default function Dashboard({ t, user, data, state, onRetry, onAddFirst }) {
  const { currency, locale } = user;
  const txs = data.transactions;
  const [remindOff, setRemindOff] = useState(false);

  const stats = useMemo(() => spendStats(txs), [txs]);
  const months = useMemo(() => monthlyTotals(txs, locale), [txs, locale]);
  const mom = useMemo(() => momSpending(txs, locale), [txs, locale]);

  // Computed net flow from logged transactions (income - spend).
  const netFlow = useMemo(() => txs.reduce((s, x) => s + (x.type === "in" ? x.amount : -x.amount), 0), [txs]);
  const savings = user.savings; // self-reported, minor units or null
  const totalBalance = (savings || 0) + netFlow;
  // Consistency: logged spending shouldn't outrun a stated savings starting point.
  const inconsistent = savings != null && savings > totalBalance;

  const cur = months[months.length - 1];
  const changed = useMemo(() => monthComparison(txs, locale), [txs, locale]);
  const obligations = useMemo(() => obligationsSum(txs), [txs]);
  // Has a commitment template gone unlogged this (latest activity) month? Then we
  // say so honestly rather than reporting template money as if it had left.
  const hasTemplates = (data.obligations || []).some((o) => o.active);
  const unloggedCommitments = hasTemplates && !(cur && cur.obligation > 0);

  // Savings rate: net of ALL outflow (discretionary + obligations). Prefer computed.
  const computedRate = cur && cur.income > 0 ? Math.round((cur.net / cur.income) * 100) : null;
  const reportedRate =
    user.monthlyIncome && user.monthlyIncome > 0 && user.monthlySpend != null
      ? Math.round(((user.monthlyIncome - user.monthlySpend) / user.monthlyIncome) * 100)
      : null;
  const rate = computedRate != null ? computedRate : reportedRate;
  const rateSelfReported = computedRate == null && reportedRate != null;

  const recent = useMemo(() => [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [txs]);

  // Self-reported estimates, with the override rule: an estimate is dropped once
  // real spending exists in that category. Estimates NEVER enter the computed
  // headline figures — they only enrich the (clearly tagged) category breakdown.
  const estimates = data.estimates || [];
  const estOnly = useMemo(() => {
    const real = new Set(stats.categories.map((c) => c.name.toLowerCase()));
    return estimates.filter((e) => !real.has(e.category.toLowerCase()));
  }, [estimates, stats.categories]);
  const estDonut = estOnly.map((e, i) => ({ name: e.category, amount: e.monthly, color: CHART_SERIES[i % CHART_SERIES.length] }));
  const tip = chartTooltip(t);
  const money = (v) => fmtMoney(v, currency, locale);

  // "What changed?" — plain-language, derived only from transactions. No judgment.
  const changedCopy = useMemo(() => {
    if (!changed) return null;
    const m = (v) => fmtMoney(v, currency, locale);
    const sd = changed.spendDelta;
    const nd = changed.netDelta;
    const hi = changed.hasIncome;

    const spend =
      sd > 0 ? `You spent ${m(sd)} more this month.`
      : sd < 0 ? `You spent ${m(-sd)} less this month.`
      : "Your spending held steady versus last month.";

    let breakdownLabel = null;
    let items = [];
    if (sd > 0 && changed.increases.length) {
      breakdownLabel = "Most of the increase came from:";
      items = changed.increases.map((c) => ({ name: c.name, str: `+${m(c.delta)}`, up: true }));
    } else if (sd < 0 && changed.decreases.length) {
      breakdownLabel = "You cut back most on:";
      items = changed.decreases.map((c) => ({ name: c.name, str: `−${m(-c.delta)}`, up: false }));
    }

    const kept = !hi ? null
      : nd > 0 ? `You kept ${m(nd)} more this month than last.`
      : nd < 0 ? `You kept ${m(-nd)} less this month.`
      : "What you kept was about the same.";

    let verdict;
    if (hi && sd > 0) verdict = nd >= 0 ? "Overall: you spent more, but still ended up keeping more." : "Overall: spending rose and you kept less — worth a look.";
    else if (hi && sd < 0) verdict = nd >= 0 ? "Overall: you spent less and kept more — a good month." : "Overall: you spent less, but income was down too, so you kept less.";
    else if (hi) verdict = nd > 0 ? "Overall: steady spending, and you kept a little more." : nd < 0 ? "Overall: steady spending, but you kept less this month." : "Overall: a steady month.";
    else verdict = sd > 0 ? "Overall: you spent more than last month." : sd < 0 ? "Overall: you spent less than last month." : "Overall: spending was steady.";

    return { spend, breakdownLabel, items, kept, verdict };
  }, [changed, currency, locale]);

  // AI Today: computed top category if data exists, else self-reported topCategory.
  const aiCard = useMemo(() => {
    if (stats.top) {
      return {
        computed: true,
        text: `Your biggest expense is ${stats.top.name} — ${Math.round(stats.top.share * 100)}% of logged spending. Setting a weekly cap here is the fastest lever you have.`,
      };
    }
    if (user.topCategory) {
      return {
        computed: false,
        text: `You told us ${user.topCategory} is your biggest expense. Log a few transactions and I'll check that against what actually happens.`,
      };
    }
    return { computed: null, text: "Log your first transaction and I'll start finding patterns in your real spending." };
  }, [stats.top, user.topCategory]);

  if (state === "loading" || state === "idle") return <Loading t={t} />;

  const hasTx = txs.length > 0;

  // Reminder: what the user hasn't filled in yet (they may have skipped onboarding).
  const missing = [];
  if (!(user.monthlyIncome != null || user.incomeEstimate != null || txs.some((x) => x.type === "in"))) missing.push("your income");
  if (!txs.some((x) => x.type === "out")) missing.push("some spending");
  if (savings == null) missing.push("your savings");
  if (!(data.goals && data.goals.length)) missing.push("a goal");

  // "Explain this" payloads — inputs + the exact working behind each derived figure.
  const balanceExplain = {
    title: "Total balance",
    rows: [
      { label: savings != null ? "Savings (you told us)" : "Savings", value: savings != null ? money(savings) : "—" },
      { label: "Logged net flow", value: money(netFlow) },
    ],
    formula: `${savings != null ? money(savings) : money(0)} + ${money(netFlow)} = ${money(totalBalance)}`,
    note: savings != null ? "The savings part is the figure you entered, not one we computed." : "From your logged income minus spending.",
  };
  const rateExplain =
    rate == null ? null
    : computedRate != null
      ? { title: "Savings rate", rows: [{ label: `Income (${cur.label})`, value: money(cur.income) }, { label: "Kept (net of all outflow)", value: money(cur.net) }], formula: `${money(cur.net)} ÷ ${money(cur.income)} = ${rate}%` }
      : { title: "Savings rate", rows: [{ label: "Monthly income (you told us)", value: money(user.monthlyIncome) }, { label: "Monthly spend (you told us)", value: money(user.monthlySpend) }], formula: `(${money(user.monthlyIncome)} − ${money(user.monthlySpend)}) ÷ ${money(user.monthlyIncome)} = ${rate}%`, note: "Based on the figures you entered, not computed from transactions." };

  // Money Timeline — where this month's income actually went. Needs income logged.
  const flow = cur && cur.income > 0
    ? (() => {
        const base = Math.max(cur.income, cur.obligation + cur.spend) || 1;
        return {
          base,
          oblW: (cur.obligation / base) * 100,
          spendW: (cur.spend / base) * 100,
          remW: (Math.max(0, cur.net) / base) * 100,
          deficit: cur.net < 0,
        };
      })()
    : null;

  return (
    <div className="sm-fade">
      <PageHeader t={t} title={`Hi, ${user.name?.split(" ")[0] || "there"}`} sub={hasTx ? "Here's where things stand, computed from your transactions." : "Your dashboard is empty until you log transactions — the numbers below are honest zeroes and your onboarding figures."} />

      {missing.length && !remindOff ? (
        <Card t={t} accent={t.accent} style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, color: t.accentSoft, display: "grid", placeItems: "center", flexShrink: 0 }}><Sparkles size={17} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ color: t.text }}>Finish setting up your profile</strong>
            <p style={{ margin: "4px 0 12px", color: t.sub, fontSize: 14, lineHeight: 1.55 }}>
              You still need to add {missing.slice(0, -1).join(", ")}{missing.length > 1 ? " and " : ""}{missing[missing.length - 1]}. Filling these in unlocks your full dashboard, patterns and analytics.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn t={t} onClick={onAddFirst}><ArrowUpRight size={15} /> Log income &amp; spending</Btn>
              <Btn t={t} kind="ghost" onClick={() => setRemindOff(true)}>Remind me later</Btn>
            </div>
          </div>
        </Card>
      ) : null}

      {inconsistent ? (
        <Card t={t} style={{ marginBottom: 16, borderColor: t.warn, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertTriangle size={18} color={t.warn} style={{ marginTop: 2 }} />
          <div style={{ fontSize: 14, color: t.sub }}>
            Your logged spending is more than the savings you told us about. That's fine, but the figures don't reconcile — update them in <strong style={{ color: t.text }}>Settings</strong> when you get a chance.
          </div>
        </Card>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard t={t} label="Total balance" accent={t.accent} icon={<Wallet size={17} />} count={{ amount: totalBalance, format: money }} hint={savings != null ? "Savings + logged flow" : "From logged transactions"} explain={balanceExplain} />
        <StatCard t={t} label="Spending logged" accent={t.accent2} icon={<LineChartIcon size={17} />} count={{ amount: stats.total, format: money }} delta={mom && mom.pct != null ? `${Math.abs(mom.pct)}% vs ${mom.prev.label}` : undefined} deltaTone="slate" deltaDir={mom ? (mom.diff <= 0 ? "down" : "up") : undefined} hint={mom ? undefined : "All time"} />
        <StatCard t={t} label="Obligations" accent={catColor("Bills")} icon={<HandCoins size={17} />} value={money(obligations)} count={{ amount: obligations, format: money }} hint="Logged commitments — not spending" />
        <StatCard t={t} label="Total savings" accent={BRAND.amber} icon={<PiggyBank size={17} />} value={savings != null ? money(savings) : "—"} count={savings != null ? { amount: savings, format: money } : undefined} selfReported={savings != null} hint={savings == null ? "Add this in Settings" : undefined} />
        <StatCard t={t} label="Savings rate" accent={BRAND.mauve} icon={<Percent size={17} />} value={rate != null ? `${rate}%` : "—"} count={rate != null ? { amount: rate, format: (n) => `${Math.round(n)}%` } : undefined} selfReported={rateSelfReported} hint={rate == null ? "Needs income data" : rateSelfReported ? "From your estimate" : cur?.label} explain={rateExplain || undefined} />
      </div>

      {hasTx && changedCopy ? (
        <Card t={t} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, display: "grid", placeItems: "center", color: t.accentSoft }}><ArrowLeftRight size={17} /></span>
            <strong style={{ color: t.text }}>What changed?</strong>
            <span style={{ color: t.sub, fontSize: 13 }}>{changed.cur.label} vs {changed.prev.label}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: t.faint, border: `1px dashed ${t.border}`, borderRadius: 999, padding: "2px 8px" }}>from your transactions</span>
          </div>
          <p style={{ margin: "0 0 6px", color: t.text, fontSize: 14.5, lineHeight: 1.55 }}>{changedCopy.spend}</p>
          {changedCopy.breakdownLabel ? (
            <div style={{ margin: "8px 0" }}>
              <div style={{ fontSize: 13, color: t.sub, marginBottom: 6 }}>{changedCopy.breakdownLabel}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {changedCopy.items.map((it) => (
                  <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: catColor(it.name) }} />
                    <span style={{ color: t.text }}>{it.name}</span>
                    <span style={{ marginLeft: "auto", fontWeight: 600, color: it.up ? t.sub : t.pos }}>{it.str}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {changedCopy.kept ? <p style={{ margin: "6px 0", color: t.text, fontSize: 14.5, lineHeight: 1.55 }}>{changedCopy.kept}</p> : null}
          <p style={{ margin: "8px 0 0", color: t.sub, fontSize: 14, lineHeight: 1.55, paddingTop: 8, borderTop: `1px solid ${t.border}` }}>{changedCopy.verdict}</p>
        </Card>
      ) : hasTx && months.length === 1 ? (
        <Card t={t} style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, display: "grid", placeItems: "center", color: t.accentSoft, flexShrink: 0 }}><ArrowLeftRight size={17} /></span>
          <div style={{ fontSize: 14, color: t.sub }}>
            <strong style={{ color: t.text }}>What changed?</strong> — once you've logged a second month, I'll show you exactly what shifted, in plain numbers. Nothing to compare yet.
          </div>
        </Card>
      ) : null}

      {flow ? (
        <Card t={t} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, display: "grid", placeItems: "center", color: t.accentSoft }}><HandCoins size={17} /></span>
            <strong style={{ color: t.text }}>Where your money went</strong>
            <span style={{ color: t.sub, fontSize: 13 }}>{cur.label}</span>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: t.faint, border: `1px dashed ${t.border}`, borderRadius: 999, padding: "2px 8px" }}>from your transactions</span>
              <Explain t={t} title={`Where your money went — ${cur.label}`} rows={[{ label: "Income in", value: money(cur.income) }, { label: "− Obligations", value: money(cur.obligation) }, { label: "− Spending", value: money(cur.spend) }]} formula={`${money(cur.income)} − ${money(cur.obligation)} − ${money(cur.spend)} = ${money(cur.net)}`} note="Obligations are commitments, not discretionary spending — kept separate on purpose." />
            </span>
          </div>
          {/* Proportional flow bar */}
          <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: t.chip, marginBottom: 14 }}>
            {cur.obligation > 0 ? <div style={{ width: `${flow.oblW}%`, background: catColor("Bills") }} title={`Obligations ${money(cur.obligation)}`} /> : null}
            {cur.spend > 0 ? <div style={{ width: `${flow.spendW}%`, background: t.accent }} title={`Spending ${money(cur.spend)}`} /> : null}
            {flow.remW > 0 ? <div style={{ width: `${flow.remW}%`, background: t.pos }} title={`Remaining ${money(cur.net)}`} /> : null}
          </div>
          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { k: "Income", val: cur.income, sign: "+", color: t.pos, dot: t.pos },
              { k: "Obligations", val: cur.obligation, sign: "−", color: t.sub, dot: catColor("Bills") },
              { k: "Spending", val: cur.spend, sign: "−", color: t.sub, dot: t.accent },
            ].map((row) => (
              <div key={row.k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${t.border}` }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: row.dot }} />
                <span style={{ color: t.text, fontSize: 14 }}>{row.k}</span>
                <span style={{ marginLeft: "auto", color: row.color, fontWeight: 600 }}>{row.sign}{money(row.val)}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 2px" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: flow.deficit ? t.neg : t.pos }} />
              <span style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>Remaining</span>
              <span style={{ marginLeft: "auto", color: flow.deficit ? t.neg : t.pos, fontWeight: 700, fontSize: 16 }}>{money(cur.net)}</span>
            </div>
            {flow.deficit ? <div style={{ fontSize: 12.5, color: t.neg, marginTop: 4 }}>You spent more than you earned this month.</div> : null}
          </div>
        </Card>
      ) : hasTx && cur && cur.income === 0 ? (
        <Card t={t} style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, display: "grid", placeItems: "center", color: t.accentSoft, flexShrink: 0 }}><HandCoins size={17} /></span>
          <div style={{ fontSize: 14, color: t.sub }}>
            <strong style={{ color: t.text }}>Where your money went</strong> — log this month's income and I'll show the full flow from income through obligations and spending to what's left.
          </div>
        </Card>
      ) : null}

      {unloggedCommitments ? (
        <Card t={t} style={{ marginBottom: 16, borderColor: t.warn, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertTriangle size={18} color={t.warn} style={{ marginTop: 2 }} />
          <div style={{ fontSize: 14, color: t.sub }}>
            You've set up recurring commitments but haven't logged one this month. Your obligations figure only counts money you've actually logged — log them when they go out, or manage the templates in <strong style={{ color: t.text }}>Settings</strong>.
          </div>
        </Card>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        <Card t={t}>
          <h3 style={{ margin: "0 0 12px", color: t.text, fontSize: 16 }}>Spending over time</h3>
          {months.length ? (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={months} margin={{ left: -12, right: 6, top: 6 }}>
                  <defs>
                    <linearGradient id="dashSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={t.accent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={t.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps(t)} />
                  <XAxis dataKey="label" {...axisProps(t)} />
                  <YAxis {...axisProps(t)} width={52} tickFormatter={(v) => fmtCompact(v, currency, locale)} />
                  <Tooltip {...tip} formatter={(v) => [money(v), "Spending"]} />
                  <Area type="monotone" dataKey="spend" stroke={t.accent} strokeWidth={2} fill="url(#dashSpend)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState t={t} icon={<LineChartIcon size={20} />} title="No spending yet" hint="Log a transaction to see your trend." action={<Btn t={t} onClick={onAddFirst}>Add transaction</Btn>} />
          )}
        </Card>

        <Card t={t}>
          <h3 style={{ margin: "0 0 12px", color: t.text, fontSize: 16 }}>By category</h3>
          {stats.total > 0 ? (
            <>
              {/* COMPUTED — real transactions only; percentages never mix in estimates */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: 170, height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats.categories} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">
                        {stats.categories.map((c) => <Cell key={c.name} fill={c.color} />)}
                      </Pie>
                      <Tooltip {...tip} formatter={(v, n) => [money(v), n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 140 }}>
                  {stats.categories.slice(0, 5).map((c) => (
                    <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
                      <span style={{ color: t.text }}>{c.name}</span>
                      <span style={{ marginLeft: "auto", color: t.sub }}>{Math.round(c.share * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Estimate-only categories, shown separately and clearly tagged */}
              {estOnly.length ? (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, color: t.sub }}>Also estimated (not yet logged)</span>
                    <SelfReportTag t={t} />
                  </div>
                  {estOnly.map((e, i) => (
                    <div key={e.category} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: CHART_SERIES[i % CHART_SERIES.length] }} />
                      <span style={{ color: t.text }}>{e.category}</span>
                      <span style={{ marginLeft: "auto", color: t.sub }}>{money(e.monthly)}/mo</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : estOnly.length ? (
            // Day one: no real spend yet — show the user's ESTIMATES, clearly tagged,
            // never presented as computed. The log-your-first-transaction prompts remain.
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, color: t.sub }}>Your estimates</span>
                <SelfReportTag t={t} />
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: 150, height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={estDonut} dataKey="amount" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2} stroke="none">
                        {estDonut.map((c) => <Cell key={c.name} fill={c.color} />)}
                      </Pie>
                      <Tooltip {...tip} formatter={(v, n) => [money(v), n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 140 }}>
                  {estOnly.map((e, i) => (
                    <div key={e.category} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: CHART_SERIES[i % CHART_SERIES.length] }} />
                      <span style={{ color: t.text }}>{e.category}</span>
                      <span style={{ marginLeft: "auto", color: t.sub }}>{money(e.monthly)}/mo</span>
                    </div>
                  ))}
                </div>
              </div>
              <p style={{ fontSize: 12, color: t.faint, marginTop: 10 }}>Rough guesses you gave us — not computed from transactions. Log real spending and these get replaced with what actually happens.</p>
            </div>
          ) : (
            <EmptyState t={t} icon={<Wallet size={20} />} title="No expenses logged" hint="Categories appear as you add spending." />
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginTop: 14 }}>
        <Card t={t}>
          <h3 style={{ margin: "0 0 12px", color: t.text, fontSize: 16 }}>Recent activity</h3>
          {hasTx ? (
            <div>
              {recent.map((tx) => {
                const I = catIcon(tx.cat);
                return (
                  <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${t.border}` }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, background: t.chip, display: "grid", placeItems: "center", color: catColor(tx.cat) }}><I size={15} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: t.text, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.name}</div>
                      <div style={{ color: t.faint, fontSize: 12 }}>{fmtDate(tx.date, locale)} · {tx.cat}</div>
                    </div>
                    <div className="sm-priv" style={{ marginLeft: "auto", fontWeight: 600, color: tx.type === "in" ? t.pos : t.text }}>
                      {tx.type === "in" ? "+" : "−"}{money(tx.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState t={t} icon={<Wallet size={20} />} title="No transactions yet" hint="This fills in as you log spending and income." action={<Btn t={t} onClick={onAddFirst}>Add your first</Btn>} />
          )}
        </Card>

        <Card t={t} style={{ background: t.surface2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: t.chip, display: "grid", placeItems: "center", color: t.accentSoft }}><Sparkles size={18} /></span>
            <strong style={{ color: t.text }}>AI Today</strong>
            <span style={{ marginLeft: "auto", fontSize: 11, color: t.faint, border: `1px dashed ${t.border}`, borderRadius: 999, padding: "2px 8px" }}>
              {aiCard.computed === true ? "from your data" : aiCard.computed === false ? "you told us" : "getting started"}
            </span>
          </div>
          <p style={{ margin: 0, color: t.sub, fontSize: 14.5, lineHeight: 1.55 }}>{aiCard.text}</p>
          {aiCard.computed !== true ? (
            <Btn t={t} kind="ghost" onClick={onAddFirst} style={{ marginTop: 14 }}><ArrowUpRight size={15} /> Log a transaction</Btn>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
