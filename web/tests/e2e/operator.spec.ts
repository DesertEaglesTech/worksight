import { expect, test } from "@playwright/test";
test("operator creates a profile, inspects, reviews and updates", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Test data mode.")).toHaveCount(0);
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  await page.getByLabel("Profile name").fill("Bearing housing · QA demo");
  await page
    .getByLabel("Description (optional)")
    .fill("Steel flange, top view. Known-good reference set.");
  await page
    .getByRole("button", { name: "Create profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Bearing housing · QA demo",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Upload known-good samples")
    .setInputFiles("public/demo/reference.png");
  await expect(page.getByText("reference.png", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Upload 1 sample", exact: true })
    .click();
  await expect(
    page.getByText("Samples accepted.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Build profile", exact: true })
    .click();
  await expect(page.getByText(/Profile v1 is ready/)).toBeVisible();
  await page.getByRole("button", { name: "Inspect with this profile" }).click();
  await page
    .getByLabel("Upload inspection image")
    .setInputFiles("public/demo/defect.png");
  await page
    .getByRole("button", { name: "Run inspection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inspection result" }),
  ).toBeVisible();
  await expect(page.locator(".result-facts")).toBeVisible();
  await expect(page.locator(".result-facts")).toContainText("Not reported");
  await page.getByLabel("Heatmap opacity").focus();
  for (let i = 0; i < 25; i++)
    await page.getByLabel("Heatmap opacity").press("ArrowLeft");
  await expect(page.locator('output[for="opacity"]')).toHaveText("40%");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByLabel("View scale", { exact: true })).toHaveText(
    "125%",
  );
  const originalBox = await page
    .getByAltText("Inspected part original", { exact: true })
    .boundingBox();
  const heatmapBox = await page
    .getByAltText("Anomaly heatmap overlay", { exact: true })
    .boundingBox();
  expect(originalBox).not.toBeNull();
  expect(heatmapBox).toEqual(originalBox);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.getByLabel("View scale", { exact: true })).toHaveText(
    "100%",
  );
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(
    page.getByAltText("Similar known-good reference", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/inspection-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Human decision", { exact: true }).selectOption("fail");
  await page
    .getByLabel("Engineer note (optional)")
    .fill("Visible gouge on the outer flange. Reject this part.");
  await page.getByRole("button", { name: "Save engineer review" }).click();
  await expect(
    page.getByText("Recorded human decision", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".decision-panel .decision")).toHaveText(
    "Needs review",
  );
  await expect(page.locator(".recorded-review .decision")).toHaveText("Fail");
  await page
    .getByRole("button", { name: "Update profile", exact: true })
    .click();
  await expect(page.getByText("v2 is ready", { exact: true })).toBeVisible();
  await expect(page.locator(".result-facts")).toContainText("v1");
  await expect(
    page.getByLabel("Reference profile", { exact: true }),
  ).toHaveValue(/.+/);
  await page.screenshot({
    path: "test-results/updated-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New image", exact: true }).click();
  await page
    .getByLabel("Upload inspection image")
    .setInputFiles("public/demo/defect.png");
  await page
    .getByRole("button", { name: "Run inspection", exact: true })
    .click();
  await expect(page.locator(".result-facts")).toContainText("v2");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/inspection-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("invalid and corrupt images cannot start inspection", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Run inspection", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Upload inspection image").setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.getByRole("alert")).toContainText("unsupported file type");
  await page.getByLabel("Upload inspection image").setInputFiles({
    name: "corrupt.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be decoded");
  await expect(
    page.getByRole("button", { name: "Run inspection", exact: true }),
  ).toBeDisabled();
});
