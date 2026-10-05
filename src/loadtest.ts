// uso: npm run loadtest -- [url] [total] [concorrência] [clientes]
const [target = "http://localhost:8080", totalArg = "30", concArg = "5", clientsArg = "1"] =
  process.argv.slice(2);

const total = Number(totalArg);
const concurrency = Number(concArg);
const clients = Number(clientsArg);

interface Result {
  server: string;
  ms: number;
  client: number;
}

const results: Result[] = new Array(total);
// Um "cookie jar" por cliente simulado (necessário para testar sticky)
const jars: Map<string, string>[] = Array.from({ length: clients }, () => new Map());
let sent = 0;
let failures = 0;

async function worker(): Promise<void> {
  while (true) {
    const n = sent++;
    if (n >= total) return;

    const client = n % clients;
    const jar = jars[client];
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const startedAt = performance.now();

    try {
      const res = await fetch(target, { headers: cookie ? { cookie } : {} });
      await res.arrayBuffer();

      for (const setCookie of res.headers.getSetCookie()) {
        const pair = setCookie.split(";")[0];
        const i = pair.indexOf("=");
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }

      results[n] = {
        server: res.headers.get("x-served-by") ?? "?",
        ms: performance.now() - startedAt,
        client,
      };
    } catch {
      failures++;
    }
  }
}

async function main(): Promise<void> {
  await Promise.all(Array.from({ length: concurrency }, worker));

  const ok = results.filter(Boolean);
  console.log(`\nAlvo: ${target} | requisições: ${total} | concorrência: ${concurrency} | clientes: ${clients}`);
  if (failures) console.log(`Falhas: ${failures}`);

  if (ok.length <= 40) {
    console.log(`\nSequência: ${ok.map((r) => r.server.replace("server-", "")).join(" ")}`);
  }

  console.log("");
  const servers = [...new Set(ok.map((r) => r.server))].sort();
  for (const s of servers) {
    const rs = ok.filter((r) => r.server === s);
    const pct = (rs.length / ok.length) * 100;
    const avg = rs.reduce((sum, r) => sum + r.ms, 0) / rs.length;
    console.log(
      `${s.padEnd(10)} ${String(rs.length).padStart(4)} (${pct.toFixed(0).padStart(3)}%) ` +
        `${"█".repeat(Math.round(pct / 2)).padEnd(50)} média ${avg.toFixed(0)}ms`,
    );
  }

  if (clients > 1) {
    console.log("\nServidores usados por cliente:");
    for (let c = 0; c < clients; c++) {
      const used = [...new Set(ok.filter((r) => r.client === c).map((r) => r.server))].sort();
      console.log(`  cliente ${c + 1}: ${used.join(", ")}`);
    }
  }
}

main();
