import http from "node:http";
import { createStrategy } from "./algorithms";
import type { Backend } from "./types";

// uso: npm run balancer -- <algoritmo> [porta]
const algorithm = process.argv[2] ?? "round-robin";
const port = Number(process.argv[3] ?? 8080);

const urls = (process.env.BACKENDS ?? "http://localhost:3001,http://localhost:3002,http://localhost:3003").split(",");
// Os pesos só importam no algoritmo "weighted"
const weights = (process.env.WEIGHTS ?? "5,3,1").split(",").map(Number);

const backends: Backend[] = urls.map((u, i) => ({
  id: `server-${i + 1}`,
  url: new URL(u),
  weight: weights[i] ?? 1,
  activeConnections: 0,
  avgResponseTimeMs: 0,
  totalRequests: 0,
  healthy: true,
}));

const strategy = createStrategy(algorithm);

function markUnhealthy(backend: Backend): void {
  if (!backend.healthy) return;
  backend.healthy = false;
  console.warn(`[health] ${backend.id} fora do ar, nova tentativa em 5s`);
  setTimeout(() => {
    backend.healthy = true;
  }, 5000);
}

function forward(backend: Backend, req: http.IncomingMessage, res: http.ServerResponse): void {
  const startedAt = performance.now();
  backend.activeConnections++;
  backend.totalRequests++;

  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      backend.activeConnections--;
    }
  };
  res.on("close", release);

  const proxyReq = http.request(
    {
      hostname: backend.url.hostname,
      port: backend.url.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: backend.url.host,
        "x-forwarded-for": req.socket.remoteAddress ?? "",
      },
    },
    (proxyRes) => {
      // tempo até o servidor responder (EMA com alfa = 0.3)
      const elapsed = performance.now() - startedAt;
      backend.avgResponseTimeMs =
        backend.avgResponseTimeMs === 0 ? elapsed : backend.avgResponseTimeMs * 0.7 + elapsed * 0.3;

      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    markUnhealthy(backend);
    if (!res.headersSent) res.writeHead(502);
    res.end(`Bad gateway: ${err.message}`);
  });

  req.pipe(proxyReq);
}

http
  .createServer((req, res) => {
    if (req.url === "/__lb/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          {
            algorithm: strategy.name,
            backends: backends.map((b) => ({
              id: b.id,
              weight: b.weight,
              healthy: b.healthy,
              activeConnections: b.activeConnections,
              avgResponseTimeMs: Math.round(b.avgResponseTimeMs),
              totalRequests: b.totalRequests,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }

    const backend = strategy.pick(
      backends.filter((b) => b.healthy),
      req,
    );

    if (!backend) {
      res.writeHead(503);
      res.end("Nenhum backend saudável");
      return;
    }

    strategy.afterPick?.(backend, req, res);
    console.log(`${req.method} ${req.url} -> ${backend.id} (ativas: ${backend.activeConnections + 1})`);
    forward(backend, req, res);
  })
  .listen(port, () => {
    console.log(`Load balancer "${strategy.name}" em http://localhost:${port}`);
    console.log(`Estatísticas em http://localhost:${port}/__lb/stats`);
  });
