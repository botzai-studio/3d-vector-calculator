import { defineEval, includes } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  async test(t) {
    await t.send("Describe this demo's supported capabilities. Do not change any data.");
    t.succeeded();
    t.calledTool("describe_demo");
    t.check(t.reply, includes("3D Vector Calculator"));
  },
});
