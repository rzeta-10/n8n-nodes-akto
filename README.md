# n8n-nodes-akto

This is an n8n community node that integrates [Akto](https://www.akto.io) into your n8n workflows. It lets you validate prompts with Akto Guardrails and ingest LLM interactions for API security monitoring.

## Operations

- **Guardrails** — Validate a user prompt before it reaches your AI Agent. Blocked prompts are routed to a separate output; allowed prompts continue normally.
- **Ingestion** — Ingest the user prompt and AI Agent response into Akto for API security monitoring and observability.

## Credentials

You need an **Akto API** credential with:

- **Akto Data Ingestion URL** — Base URL of your Akto data ingestion service (e.g. `http://localhost:8080`)
- **Akto API Token** — API token sent as the `Authorization` header on every request
- **Timeout (seconds)** — Request timeout (default: 5s)

## Compatibility

Tested with n8n v1.x.

## Usage

### Typical AI Agent workflow

1. Add the **Akto** node before your AI Agent with operation set to **Guardrails**
2. Connect the **Allowed** output to your AI Agent
3. Add another **Akto** node after the AI Agent with operation set to **Ingestion**
4. The Ingestion node references the Guardrails node output by default — update the **Prompt** field if you rename the Guardrails node

The Guardrails node fails open: if the Akto service is unreachable, prompts are allowed through automatically.

## Resources

- [Akto Documentation](https://docs.akto.io)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE.md)
