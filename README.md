# Water & Climate Risk Monitor

**How exposed are North American supply chains to water and climate risk?**

A dashboard comparing the USA, Mexico and Canada on water stress, water use, methane emissions and disaster disruption. A Python pipeline pulls every figure from the World Bank Indicators API, and a GitHub Action refreshes it monthly. No number on the page is typed in by hand.

**[View the live dashboard](https://rebe-canales.github.io/water-climate-risk-monitor/)**

## Key findings

1. **Mexico is the region's water-stress hotspot.** It withdraws 44.9% of its available freshwater (2022), versus 28.2% in the US and 3.7% in Canada, just under FAO's 50% "medium stress" threshold. That is a national average, so northern industrial states run tighter.
2. **In Mexico, industry is a small water user next to farming.** Agriculture takes 76% of withdrawals and industry 9%, versus 47% (US) and 76% (Canada) for industry. A plant in Mexico depends on allocation decisions dominated by other users, which is a siting and nearshoring risk.
3. **The buffer is shrinking.** Renewable water per person fell 23% in Mexico since 2000 (16% US, 21% Canada), driven by population growth on a fixed resource.
4. **Mexico's methane is diverging:** +12.7% from 2000 to 2024, versus about +2% in the US and Canada. This matters for buyers reporting Scope 3 emissions.
5. **Physical disruption hits the US hardest in volume:** 8.1M disaster displacements from 2014 to 2023, versus 0.7M in Mexico and 0.55M in Canada, with single storms driving the spikes.

*Figures as of the October 2026 data refresh. The dashboard recalculates them on every refresh.*

## How it works

```
World Bank Indicators API ──► pipeline/fetch_data.py ──► data/indicators.csv / .json / data.js ──► index.html
                                  (monthly via GitHub Actions)
```

| Indicator | World Bank code | Original source |
|---|---|---|
| Water stress (% of available freshwater withdrawn) | `ER.H2O.FWST.ZS` | FAO AQUASTAT |
| Renewable internal freshwater per person | `ER.H2O.INTR.PC` | FAO AQUASTAT |
| Withdrawals by sector: agriculture, industry | `ER.H2O.FWAG.ZS`, `ER.H2O.FWIN.ZS` | FAO AQUASTAT |
| Methane emissions excl. land use (Mt CO2e) | `EN.GHG.CH4.MT.CE.AR5` | EDGAR, EU Joint Research Centre |
| New displacements caused by disasters | `VC.IDP.NWDS` | IDMC |

## Data quality checks

The pipeline flags two problems automatically, and the dashboard reports them instead of hiding them:

- **Carried-forward values.** AQUASTAT doesn't measure every country every year, so some years repeat the last reading. US water stress is flat from 2015 onward for this reason. These segments appear dashed on the chart.
- **Step changes.** Mexico's water stress jumps from 32.9% to 44.5% in a single year (2018), which is almost certainly a revision in the source data rather than a real change. It's marked on the chart, and trend comparisons across 2018 should be treated with caution.

## Run it yourself

```bash
python pipeline/fetch_data.py      # standard library only, nothing to install
open index.html                    # or: python -m http.server, then visit localhost:8000
```

## Related work

This monitor is the quantitative baseline for [Strategic Scenarios: Mexico's Water Crisis 2025–2035](reports/Escenarios_Estrategicos_Crisis_Hidrica_Mexico_2025-2035.pdf) (in Spanish), a scenario analysis built on governance and infrastructure investment.

## Next steps

- Basin-level water stress (WRI Aqueduct) for the Rio Grande/Bravo and northern Mexico, where national averages hide the real exposure
- Overlay manufacturing plant locations (INEGI DENUE) to quantify how much capacity sits in high-stress areas

---
Built by [Rebeca Canales](https://www.linkedin.com/in/rebecanales/) · Python, JavaScript, Chart.js
