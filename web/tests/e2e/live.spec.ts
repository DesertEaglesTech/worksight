import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
test.skip(
  process.env.WORKSIGHT_E2E_MODE !== "live",
  "Requires real FastAPI and a prepared VisA image manifest.",
);
const manifestPath =
  process.env.WORKSIGHT_E2E_IMAGES || "../work/live-qa/visa-files.json";
test("live CPU/AMD flow persists profiles, inspections, reviews and evaluated versions", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    !existsSync(manifestPath),
    "Prepare a manifest with references[], normal[] and anomaly[] absolute file paths.",
  );
  const images = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    references: string[];
    normal: string[];
    anomaly: string[];
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  const name = `PCB1 live QA ${Date.now()}`;
  await page.getByLabel("Profile name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create profile", exact: true })
    .click();
  await expect(page.locator(".draft-notice")).toContainText(
    "Reloading discards",
  );
  await page
    .getByLabel("Upload known-good samples", { exact: true })
    .setInputFiles(images.references.slice(0, 20));
  await page
    .getByRole("button", { name: "Stage 20 samples", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Build profile", exact: true })
    .click();
  await expect(
    page.getByText("Profile v1 is ready.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByLabel("Reference profile", { exact: true })
    .selectOption({ label: `${name} · v1` });
  async function inspect(file: string) {
    await page
      .getByLabel("Upload inspection image", { exact: true })
      .setInputFiles(file);
    await page
      .getByRole("button", { name: "Run inspection", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Inspection result", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByAltText("Inspected part original", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByAltText("Anomaly heatmap overlay", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByAltText("Similar known-good reference sample", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".result-facts")).toContainText("Anomaly score");
    await expect(page.locator(".runtime-badge")).toBeVisible();
  }
  await inspect(images.normal[0]);
  await page.getByLabel("Human decision", { exact: true }).selectOption("pass");
  await page
    .getByLabel("Engineer note (optional)", { exact: true })
    .fill("Dataset normal image: confirmed for integration QA.");
  await page
    .getByRole("button", { name: "Save engineer review", exact: true })
    .click();
  await expect(
    page.getByLabel("Human decision", { exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".recorded-review")).toContainText("Pass");
  await page.getByRole("button", { name: "New image", exact: true }).click();
  await inspect(images.anomaly[0]);
  await page.getByLabel("Human decision", { exact: true }).selectOption("fail");
  await page
    .getByRole("button", { name: "Save engineer review", exact: true })
    .click();
  await expect(page.locator(".recorded-review")).toContainText("Fail");
  await page
    .getByRole("button", { name: "Reference samples", exact: true })
    .click();
  await page
    .getByLabel("Normal validation images", { exact: true })
    .setInputFiles(images.normal.slice(1, 6));
  await page
    .getByLabel("Anomalous validation images", { exact: true })
    .setInputFiles(images.anomaly.slice(1, 6));
  await page
    .getByLabel(
      "I understand this validation set will be frozen and cannot be replaced.",
    )
    .check();
  await page
    .getByRole("button", {
      name: "Save and freeze validation set",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("1. Validation images · Frozen", { exact: true }),
  ).toBeVisible();
  await page.locator(".feedback-option input").check();
  await page
    .getByRole("button", { name: "Build candidate (1)", exact: true })
    .click();
  await page.getByRole("button", { name: "Evaluate v2", exact: true }).click();
  const report = page.getByRole("region", { name: "Candidate evaluation" });
  await expect(report).toBeVisible();
  await expect(report).toContainText("Missed defects");
  const passed = (await page.locator(".gate-result").innerText()).startsWith(
    "Passed",
  );
  if (passed) {
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Apply v2", exact: true }).click();
    await expect(
      page.locator(".version-row").filter({ hasText: "v2 · Active" }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restore v1", exact: true }).click();
    await expect(
      page.locator(".version-row").filter({ hasText: "v1 · Active" }),
    ).toBeVisible();
  } else
    await expect(
      page.getByRole("button", { name: "Apply v2", exact: true }),
    ).toBeDisabled();
  expect(errors).toEqual([]);
});
