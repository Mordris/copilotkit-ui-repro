// capture.mjs <out-dir> — screenshots the repro page in light and dark, and records what assistive
// technology gets: Chromium's computed accessibility tree, each button's accessible name, the reasoning
// header text, and the text/background contrast of the A2UI card.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const out = process.argv[2];
const base = process.env.BASE_URL ?? "http://127.0.0.1:5179/";
const lang = process.env.LABEL_LANG ?? "de";
mkdirSync(out, { recursive: true });

function luminance([r, g, b]) {
  const c = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

const browser = await chromium.launch();
const report = {};
// Nothing may leave the machine: any request to a non-local host is blocked and reported.
const external = [];
for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.route("**/*", (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === "127.0.0.1" || hostname === "localhost") return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto(`${base}?theme=${theme}&lang=${lang}`);
  await page.locator("[data-surface-id]").first().waitFor();
  await page.getByText("Continue").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${theme}.png` });
  await page.locator("[data-surface-id]").first().screenshot({ path: `${out}/${theme}-a2ui-card.png` });

  const buttons = [];
  for (const b of await page.getByRole("button").all()) {
    buttons.push({
      testid: await b.getAttribute("data-testid"),
      ariaLabel: await b.getAttribute("aria-label"),
      snapshot: (await b.ariaSnapshot()).split("\n")[0],
    });
  }

  // The A2UI card is the first element inside the surface that paints its own background.
  const card = await page.locator("[data-surface-id]").first().evaluate((surface) => {
    const all = [surface, ...surface.querySelectorAll("*")];
    const box = all.find((el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)");
    const title = [...surface.querySelectorAll("*")].find((el) => el.textContent === "Pick a region" && el.children.length === 0);
    const chip = [...surface.querySelectorAll("button")].find((el) => el.textContent === "North");
    // Normalise any CSS colour (oklch, rgb, …) to rgb through a canvas.
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const toRgb = (c) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };
    return {
      cardBackground: toRgb(getComputedStyle(box).backgroundColor),
      cardInlineStyle: box.getAttribute("style"),
      cardClass: box.getAttribute("class"),
      titleColor: toRgb(getComputedStyle(title).color),
      chipBackground: toRgb(getComputedStyle(chip).backgroundColor),
      chipColor: toRgb(getComputedStyle(chip).color),
    };
  });
  card.titleContrast = contrast(card.titleColor, card.cardBackground);
  card.chipContrast = contrast(card.chipColor, card.chipBackground);

  // Slash-command menu with no matches, then the video preview, in the first chat.
  const first = page.getByTestId("finished");
  await first.getByRole("textbox").fill("/zzz");
  const menu = first.locator("[data-testid='copilot-slash-menu']");
  await menu.waitFor();
  const slashMenu = { snapshot: await menu.ariaSnapshot(), text: await menu.innerText() };
  await first.getByRole("textbox").fill("");
  await first.getByRole("button", { name: /^(Play video|Video abspielen)$/ }).click();
  // The preview is portalled to <body> as a fixed full-screen overlay (React) or teleported (Vue).
  const close = page
    .locator('[data-testid="copilot-chat-attachment-lightbox"] button, body > div[class*="cpk:fixed"] button')
    .first();
  await close.waitFor();
  const lightboxClose = (await close.ariaSnapshot()).split("\n")[0];
  await page.keyboard.press("Escape");

  report[theme] = {
    slashMenu,
    lightboxClose,
    reasoningHeaders: await page.getByText(/^(Thinking…|Denkt nach…|Thought for .+)$/).allInnerTexts(),
    buttons,
    card,
    ariaSnapshot: await page.locator("main").ariaSnapshot(),
  };
  writeFileSync(`${out}/${theme}-aria.yaml`, report[theme].ariaSnapshot + "\n");
  await page.close();
}
await browser.close();
writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, external }, null, 2) + "\n");
console.log(`external requests (blocked): ${external.length}`, external);

for (const [theme, r] of Object.entries(report)) {
  console.log(`== ${theme}`);
  console.log("reasoning headers:", JSON.stringify(r.reasoningHeaders));
  console.log("slash menu:", JSON.stringify(r.slashMenu));
  console.log("preview close:", r.lightboxClose);
  const unnamed = r.buttons.filter((b) => !/button ".+"/.test(b.snapshot));
  console.log(`buttons: ${r.buttons.length}, without an accessible name: ${unnamed.length}`);
  for (const b of unnamed) console.log("   unnamed:", b.testid ?? "(no testid)", "|", b.snapshot);
  console.log(`A2UI card bg ${r.card.cardBackground}, title ${r.card.titleColor} -> contrast ${r.card.titleContrast}:1; chip ${r.card.chipColor} on ${r.card.chipBackground} -> ${r.card.chipContrast}:1`);
  console.log(`   card style="${r.card.cardInlineStyle}" class=${JSON.stringify(r.card.cardClass)}`);
}
