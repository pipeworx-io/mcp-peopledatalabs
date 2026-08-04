# mcp-peopledatalabs

People Data Labs MCP — wraps the PDL person/company enrichment API

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `pdl_person_enrich` | Enrich a person from their email / LinkedIn / name+company / phone using People Data Labs. Returns job title, company, emails, phone numbers, location, and skills. Provide at least one identifier. Example: pdl_person_enrich({ email: "sean@peopledatalabs.com", _apiKey: "your-key" }) |
| `pdl_company_enrich` | Enrich a company from its name or domain using People Data Labs. Returns size, employee count, industry, founding year, location, LinkedIn, and website. Provide a name and/or website. Example: pdl_company_enrich({ website: "peopledatalabs.com", _apiKey: "your-key" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "peopledatalabs": {
      "url": "https://gateway.pipeworx.io/peopledatalabs/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Peopledatalabs data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
