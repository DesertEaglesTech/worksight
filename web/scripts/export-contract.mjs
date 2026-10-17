import fs from "node:fs/promises";
import { z } from "zod";
import { profileSchema, capabilitiesSchema, inspectionSchema, jobSchema, versionSchema, comparisonSchema } from "../src/lib/contract.ts";
const schemas = {};
for (const [name, schema] of Object.entries({ Profile: profileSchema, Capabilities: capabilitiesSchema, Inspection: inspectionSchema, Job: jobSchema, ProfileVersion: versionSchema, VersionComparison: comparisonSchema })) {
  const json = z.toJSONSchema(schema); delete json.$schema; schemas[name] = json;
}
schemas.Accepted = { type: "object", required: ["job_id"], properties: { job_id: { type: "string" } } };
schemas.Error = { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } };
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const list = name => ({ type: "object", required: ["items"], properties: { items: { type: "array", items: ref(name) } } });
const jsonBody = schema => ({ required: true, content: { "application/json": { schema } } });
const obj = props => ({ type: "object", required: Object.keys(props), properties: props });
const string = { type: "string" };
const decision = { type: "string", enum: ["pass", "fail", "review"] };
const multipart = props => ({ required: true, content: { "multipart/form-data": { schema: obj(props) } } });
const file = { type: "string", format: "binary" };
const paths = {};
function route(method, path, response, status = "200", requestBody, extra = []) {
  const parameters = [...(path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: string }] : []), ...extra];
  paths[path] ??= {};
  paths[path][method] = { operationId: `${method}_${path.replace(/[^a-zA-Z0-9]+/g, "_")}`, parameters, ...(requestBody ? { requestBody } : {}), responses: { [status]: { description: "Success", content: { "application/json": { schema: typeof response === "string" ? ref(response) : response } } }, default: { description: "Error", content: { "application/json": { schema: ref("Error") } } } } };
}
route("get", "/v1/capabilities", "Capabilities");
route("get", "/v1/profiles", list("Profile"));
route("post", "/v1/profiles", "Profile", "201", jsonBody(obj({ name: { type: "string", minLength: 1, maxLength: 100 }, description: { type: "string", maxLength: 1000 } })));
route("post", "/v1/profiles/{id}/samples", "Profile", "200", multipart({ files: { type: "array", minItems: 1, items: file } }));
route("post", "/v1/profiles/{id}/build", "Accepted", "202", jsonBody({ type: "object" }));
route("get", "/v1/jobs/{id}", "Job");
route("post", "/v1/inspections", "Accepted", "202", multipart({ profile_id: string, image: file }));
route("get", "/v1/inspections/{id}", "Inspection");
route("post", "/v1/inspections/{id}/feedback", "Inspection", "200", jsonBody(obj({ human_decision: decision, comment: { type: "string", maxLength: 2000 } })));
route("get", "/v1/profiles/{id}/versions", list("ProfileVersion"));
route("get", "/v1/profiles/{id}/compare", "VersionComparison", "200", undefined, ["from", "to"].map(name => ({ name, in: "query", required: true, schema: { type: "integer", minimum: 1 } })));
route("post", "/v1/profiles/{id}/rollback", "Accepted", "202", jsonBody(obj({ version: { type: "integer", minimum: 1 } })));
paths["/v1/assets/{id}"] = { get: { parameters: [{ name: "id", in: "path", required: true, schema: string }], responses: { 200: { description: "Inspection image or transparent heatmap PNG aligned to original", content: Object.fromEntries(["image/png", "image/jpeg", "image/webp"].map(mime => [mime, { schema: file }])) } } } };
await fs.writeFile("../docs/openapi.proposed.json", JSON.stringify({ openapi: "3.1.0", info: { title: "Worksight proposed API", version: "1.0.0-proposed", description: "Awaiting ML developer confirmation. No production endpoint is implied." }, paths, components: { schemas } }, null, 2) + "\n");
console.log("Exported docs/openapi.proposed.json");
