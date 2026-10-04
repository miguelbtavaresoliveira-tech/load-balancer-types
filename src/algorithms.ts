import type { IncomingMessage, ServerResponse } from "node:http";
import  type { Backend, Strategy } from "./types";

/* 1) Round Robin: um servidor por vez, em ordem circular */
export class RoundRobin implements Strategy {
    readonly name = "round-robin";
    private next = 0;

    pick(backends: Backend[]): Backend | undefined {
        if (backends.length === 0 ) return undefined
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
function pickMindBy (
    backends: Backend[],
    score: (b: Backend) => number, tieCounter: { n: number },
) : Backend | undefined {
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
