Remove the monthly ad spend slider and its dependent competitor comparison row.

Changes to `src/inspirova.html`:
1. **HTML** — Delete the first `.slider-row` block (label + range input for "Monthly ad spend").
2. **Comparison table** — Remove the "Commission" row since it was driven by ad spend and would be €0 for both sides with no slider.
3. **CSS** — Remove any `.sliders`-specific styles if they become dead (keep `.slider-row` for the remaining leads slider).
4. **JS** — Remove `sliderAd` and `valAd` lookups, the `sliderAd` event listener, and `updateSliders()` reference to ad spend. Set `adSpend = 0` in `calc()` so the competitor total drops to retainer + cost-per-lead only. Remove `set("ctCommission", ...)` call.
5. **Bundle pricing** — No change; bundle/service prices remain the same.

Result: the calculator keeps the leads slider and all bundle/build-your-own pricing, but drops the ad-spend input and the commission line item from the comparison.