# 3D Vector Calculator agent

The browser app runs independently with npm start and npm test; it needs no key.

For the companion Agent SDK project (Node >=22.13):

```sh
npm install
npm run agent:validate
npm run agent:typecheck
npm run agent:dev
# In another terminal:
npx agent-sdk tool call describe_demo --dir .
npm run agent:eval -- --list
```

Model turns and evals require a Cursor credential. The local SDK server uses custom system instructions; accounts without that entitlement can still validate, list evals and call the read-only tool, but cannot run local model turns with the stock SDK server. The Studio uses a first-message compatibility transport for those accounts.

The companion can explain the approved capabilities. It cannot read or mutate the browser's localStorage. No channels, schedules, deployment or external writes are enabled.
