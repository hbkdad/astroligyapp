import type { PublicCompatibilityShareViewState } from "@/presentation/public-compatibility-share-read-model";

export function renderPublicCompatibilityShareDocument(
  state: PublicCompatibilityShareViewState,
): string {
  const ready = state.status === "ready";
  const locale = ready ? escapeHtml(state.model.locale) : "en-CA";
  const content = ready
    ? renderReadyShare(state.model)
    : renderUnavailable(state.message);

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive, nosnippet"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="dark"><title>Shared compatibility report</title><meta name="description" content="A private-link compatibility report with calculated facts kept separate from tradition-framed reflections."><link rel="stylesheet" href="/match-share.css"></head><body><a class="skip-link" href="#share-content">Skip to shared report</a><header class="share-site-header"><span class="share-brand"><span class="share-brand-mark" aria-hidden="true">✦</span>Personal Cosmic Calendar</span><span class="privacy-badge">Private-link view</span></header>${content}</body></html>`;
}

function renderReadyShare(
  model: Extract<
    PublicCompatibilityShareViewState,
    { status: "ready" }
  >["model"],
): string {
  const categories = model.categories
    .map(
      (category) =>
        `<li><div><h3>${escapeHtml(category.label)}</h3><strong>${category.score}</strong></div><meter min="0" max="100" value="${category.score}" aria-label="${escapeHtml(`${category.label}: ${category.scoreText}`)}">${escapeHtml(category.scoreText)}</meter><p>${escapeHtml(category.scoreText)} · ${escapeHtml(category.confidenceText)} · ${escapeHtml(category.factorCountText)}</p></li>`,
    )
    .join("");
  const factors = model.factors
    .map((factor) => {
      const factFallback =
        factor.factStatus === "unsupported"
          ? "<small>Deterministic content unavailable.</small>"
          : "";
      const reflectionFallback =
        factor.reflectionStatus === "unsupported"
          ? "<small>Tradition reflection unavailable.</small>"
          : "";
      return `<li><header><div><p>${escapeHtml(factor.categoryLabel)}</p><h3>${escapeHtml(factor.toneLabel)} factor</h3></div><strong>${escapeHtml(factor.impactText)}</strong></header><div class="share-copy-grid"><div><p class="section-kicker">Calculated fact</p><p>${escapeHtml(factor.factText)}</p>${factFallback}</div><div><p class="section-kicker">Tradition-framed reflection</p><p>${escapeHtml(factor.reflectionText)}</p>${reflectionFallback}</div></div></li>`;
    })
    .join("");

  return `<main id="share-content" class="share-shell" tabindex="-1"><header class="share-intro"><p class="eyebrow">${escapeHtml(model.eyebrow)}</p><h1>${escapeHtml(model.title)}</h1><p class="share-summary">${escapeHtml(model.summary)}</p><p class="share-disclaimer">${escapeHtml(model.disclaimer)}</p></header><section class="share-panel" aria-labelledby="share-scores-heading"><div class="section-heading"><div><p class="section-kicker">Product-defined heuristics</p><h2 id="share-scores-heading">Category scores</h2></div><span>5 transparent categories</span></div><ul class="share-score-grid">${categories}</ul></section><section class="share-panel" aria-labelledby="share-factors-heading"><div class="section-heading"><div><p class="section-kicker">Explainable contributions</p><h2 id="share-factors-heading">Calculated facts and reflections</h2></div><span>${model.factors.length} matched factors</span></div><ol class="share-factor-list">${factors}</ol></section><footer class="share-footer"><p>This view contains only the deliberately shared report. Birth details, account data, calculation traces, and internal identifiers are not included.</p></footer></main>`;
}

function renderUnavailable(message: string): string {
  return `<main id="share-content" class="share-shell status-shell" tabindex="-1"><p class="eyebrow">Shared compatibility</p><h1>This shared comparison is unavailable.</h1><p>${escapeHtml(message)}</p><p class="share-disclaimer">For privacy, unavailable, expired, revoked, and deleted links all use the same response.</p></main>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}
