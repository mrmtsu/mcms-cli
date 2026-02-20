#!/usr/bin/env node

const docsByCategory = {
  "content-api": ["コンテンツ一覧取得API.md", "コンテンツ詳細取得API.md"],
  manual: ["はじめに.md"]
};

const docsBody = {
  "content-api/コンテンツ一覧取得API.md":
    "---\ncontentId: get-list-contents\ndirectory: content-api\n---\n\n# GET /api/v1/{endpoint}\n\nList endpoint docs body.",
  "content-api/コンテンツ詳細取得API.md":
    "---\ncontentId: get-content\ndirectory: content-api\n---\n\n# GET /api/v1/{endpoint}/{content_id}\n\nDetail endpoint docs body.",
  "manual/はじめに.md": "---\ncontentId: introduction\ndirectory: manual\n---\n\n# はじめに\n\nManual introduction."
};

let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  buffer = Buffer.concat([buffer, next]);

  for (const message of readMessages()) {
    handleMessage(message);
  }
});

function readMessages() {
  const messages = [];

  while (true) {
    if (buffer.length === 0) {
      break;
    }

    if (startsWithContentLength(buffer)) {
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator < 0) {
        break;
      }

      const header = buffer.slice(0, separator).toString("utf8");
      const length = parseContentLength(header);
      if (length === null) {
        process.exit(1);
      }

      const start = separator + 4;
      const end = start + length;
      if (buffer.length < end) {
        break;
      }

      const body = buffer.slice(start, end).toString("utf8");
      buffer = buffer.slice(end);
      messages.push(JSON.parse(body));
      continue;
    }

    const newline = buffer.indexOf(0x0a);
    if (newline < 0) {
      break;
    }

    const line = buffer.slice(0, newline).toString("utf8").replace(/\r$/, "").trim();
    buffer = buffer.slice(newline + 1);
    if (line.length === 0) {
      continue;
    }
    messages.push(JSON.parse(line));
  }

  return messages;
}

function startsWithContentLength(buf) {
  return buf.subarray(0, 32).toString("utf8").toLowerCase().startsWith("content-length:");
}

function parseContentLength(header) {
  const lines = header.split(/\r\n/);
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index < 0) {
      continue;
    }

    const key = line.slice(0, index).trim().toLowerCase();
    if (key !== "content-length") {
      continue;
    }

    const value = Number.parseInt(line.slice(index + 1).trim(), 10);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    return value;
  }

  return null;
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function respond(id, result) {
  send({
    jsonrpc: "2.0",
    id,
    result
  });
}

function error(id, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: {
      message
    }
  });
}

function toolText(id, text) {
  respond(id, {
    content: [{ type: "text", text }]
  });
}

function handleMessage(message) {
  if (typeof message !== "object" || message === null) {
    return;
  }

  const id = message.id;
  const method = message.method;
  if (typeof method !== "string") {
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "mock-doc-mcp",
        version: "1.0.0"
      }
    });
    return;
  }

  if (method !== "tools/call") {
    error(id, `unsupported method: ${method}`);
    return;
  }

  const params = message.params && typeof message.params === "object" ? message.params : {};
  const name = params.name;
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};

  if (name === "fetch_general") {
    toolText(id, "# microCMS仕様概要");
    return;
  }

  if (name === "list_documents") {
    const category = typeof args.category === "string" ? args.category : undefined;
    const categories = Object.entries(docsByCategory)
      .filter(([key]) => !category || key === category)
      .map(([key, files]) => ({ category: key, files }));

    toolText(
      id,
      JSON.stringify(
        {
          categories,
          totalFiles: categories.reduce((sum, row) => sum + row.files.length, 0)
        },
        null,
        2
      )
    );
    return;
  }

  if (name === "search_document") {
    const category = typeof args.category === "string" ? args.category : "";
    const filename = typeof args.filename === "string" ? args.filename : "";
    const key = `${category}/${filename}`;
    const body = docsBody[key];
    if (!body) {
      error(id, `document not found: ${key}`);
      return;
    }

    toolText(id, `カテゴリー: ${category}\nファイル: ${filename}\n\n${body}`);
    return;
  }

  error(id, `unsupported tool: ${name}`);
}
