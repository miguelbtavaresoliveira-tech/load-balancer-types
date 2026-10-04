import type { IncomingMessage, ServerResponse } from "node:http";
import type { Backend, Strategy } from "./types";

/* 1) Round Robin: um servidor por vez, em ordem circular */
export class RoundRobin implements Strategy {
    readonly name = "round-robin";
    private next = 0;

    pick(backends: Backend[]): Backend | undefined {
        if (backends.length === 0) return undefined
        const backend = backends[this.next % backends.length]
        this.next = (this.next + 1) % backends.length
        return backend
    }
}

/*
* 2) Weighted Round Robin (smooth version, same ideia from ngix).
* Com pesos 5, 3, 1 a sequência é bem espalhada (ex: 1 2 1 3 1 2 1 2 1)
* em vez de mandar 5 seguidas para o mesmo servidor.
*/

export class WeightedRoundRobin implements Strategy {
    readonly name = "weighted-round-robin"
    private current = new Map<string, number>()

    pick(backends: Backend[]): Backend | undefined {
        if (backends.length === 0) return undefined

        let total = 0
        let best: Backend = backends[0]
        let bestValue = -Infinity

        for (const b of backends) {
            const value = (this.current.get(b.id) ?? 0) + b.weight;
            this.current.set(b.id, value);

            total += b.weight;
            if (value > bestValue) {
                best = b;
                bestValue = value
            }
        }


        this.current.set(best.id, bestValue - total)
        return best
    }
}

/* Desempate rotativo: evita que o primeiro da lista sempre ganhe */
function pickMindBy(
    backends: Backend[],
    score: (b: Backend) => number, tieCounter: { n: number },
): Backend | undefined {
    if (backends.length === 0) return undefined;
    const scores = backends.map(score);
    const min = Math.min(...scores);
    const candidates = backends.filter((_, i) => scores[i] === min)
    return candidates[tieCounter.n++ % candidates.length]
}

/* 3) Least connections: quem tem menos requisições em andamento */
export class LeastConnections implements Strategy {
    readonly name = "least-connections";
    private tie = { n: 0 }

    pick(backends: Backend[]): Backend | undefined {
        return pickMindBy(backends, (b) => b.activeConnections, this.tie)
    }
}


/*
* 4) Least Response Time: menor tempo de resposta(tempo médio x (conexões ativas + 1))
* Começa com o tempo 0, então todos são testados no início.
*/
export class leastResponseTime implements Strategy {
    readonly name = "least-response-time";
    private tie = { n: 0 }

    pick(backends: Backend[]): Backend | undefined {
        return pickMindBy(
            backends,
            (b) => b.avgResponseTimeMs * (b.activeConnections + 1),
            this.tie,
        );
    }
}


/*
* 5) Sticky Round Robin: o primeiro acesso do cliente é distribuido por 
* round robin e o servidor escolhido fica gravado em um coookie. os 
* proximos acessos irão sempre para o mesmo servidor (enquanto ele estiver saudavel)
*/

const COOKIE_NAME = "LB_BACKEND";

function parseCookies(header: string | undefined): Record<string, string> {
    const out: Record<string, string> = {}
    for (const part of (header ?? "").split(";")) {
        const i = part.indexOf("=")
        if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
    }
    return out
}


export class StickyRoundRobin implements Strategy {
    readonly name = "sticky-round-robin"
    private fallback = new RoundRobin()

    pick(backends: Backend[], req: IncomingMessage): Backend | undefined {
        const id = parseCookies(req.headers.cookie)[COOKIE_NAME]
        const sticky = id ? backends.find((b) => b.id === id) : undefined
        return sticky ?? this.fallback.pick(backends)
    }

    afterPick(backend: Backend, req: IncomingMessage, res: ServerResponse): void {
        const current = parseCookies(req.headers.cookie)[COOKIE_NAME]
        if (current !== backend.id) {
            res.setHeader(
                "Set-Cookie",
                `${COOKIE_NAME}=${backend.id}; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax`,
            )
        }
    }
}


export const ALGORITHMS = [
    "round-robin",
    "weighted",
    "least-connections",
    "least-response-time",
    "sticky",
] as const 

export function createStrategy(name: string): Strategy {
  switch (name) {
    case "round-robin":
      return new RoundRobin();
    case "weighted":
      return new WeightedRoundRobin();
    case "least-connections":
      return new LeastConnections();
    case "least-response-time":
      return new leastResponseTime();
    case "sticky":
      return new StickyRoundRobin();
    default:
      throw new Error(`Algoritmo desconhecido: "${name}". Use: ${ALGORITHMS.join(" | ")}`);
  }
}
