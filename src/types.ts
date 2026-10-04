import type { IncomingMessage, ServerResponse } from "node:http"

export interface Backend {
    id: string,
    url: URL,
    weight: number,
    activeConnections: number,
    avgResponseTimeMs: number,
    totalRequests: number,
    healthy: boolean,
}

export interface Strategy {
    readonly name: string;
    /* Recebe apenas backends saudáveis e escolhe um */
    pick(backends: Backend[], req: IncomingMessage): Backend | undefined;
    /* Gancho opcional, usado pelo sticky para gravar o cookie. */
    afterPick?(backend: Backend, req: IncomingMessage, res: ServerResponse): void
}