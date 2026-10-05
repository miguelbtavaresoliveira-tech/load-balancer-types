import http from 'node:http'

interface ServerConfig {
    name: string;
    port: number;
    delayMs: number;
}

/* Três servidores com velocidades diferentes, para o balanceamento ficar invísivel. */

const SERVERS: ServerConfig[] = [
    {name: 'server-1',  port: 3001, delayMs: 50}, //rápido
    {name: 'server-2',  port: 3002, delayMs: 200}, //médio
    {name: 'server-3',  port: 3003, delayMs: 600}, //lento
]

function start({ name, port, delayMs }: ServerConfig): void {
    let active = 0;

    http 
        .createServer((req, res) => {
            active ++
            const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
            // ?delay=2000 força uma requisição lenta(bbom para testar least-connection)
            const delay = Number(url.searchParams.get("delay") ?? delayMs)

            setTimeout(() => {
                res.writeHead(200, {
                    "content-type": "application/json",
                    "x-served-by": name,
                })
                res.end(JSON.stringify({ server: name, port, delayMs: delay, activeConnections: active}))
                active--;
            }, delay)
        })
        .listen(port, () => console.log(`${name} em http://localhost:${port} (delay padrão ${delayMs}ms)`))
}

SERVERS.forEach(start)